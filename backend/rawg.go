package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
)

const (
	rawgBaseURL  = "https://api.rawg.io/api"
	listCacheTTL = 10 * time.Minute
	itemCacheTTL = 24 * time.Hour
	maxCacheSize = 2000
)

// Only these query params reach RAWG; anything else (including "key") is dropped.
var gameListParams = []string{
	"page", "page_size", "search", "search_precise", "genres", "parent_platforms", "platforms",
	"dates", "metacritic", "ordering", "developers", "publishers", "tags", "exclude_additions",
}

var pagingParams = []string{"page", "page_size", "search"}

func filterParams(in map[string]string, allowed []string) url.Values {
	out := url.Values{}
	for _, k := range allowed {
		if v, ok := in[k]; ok && v != "" && len(v) <= 200 {
			out.Set(k, v)
		}
	}
	return out
}

type cacheEntry struct {
	status  int
	body    []byte
	expires time.Time
}

type rawgProxy struct {
	key    string
	base   string
	client *http.Client

	mu    sync.Mutex
	cache map[string]cacheEntry
}

func newRAWGProxy(key string) *rawgProxy {
	return &rawgProxy{
		key:    key,
		base:   rawgBaseURL,
		client: &http.Client{Timeout: 10 * time.Second},
		cache:  map[string]cacheEntry{},
	}
}

func (p *rawgProxy) register(r fiber.Router) {
	r.Get("/games", p.handle(func(c fiber.Ctx) (string, url.Values, time.Duration, error) {
		return "/games", filterParams(c.Queries(), gameListParams), listCacheTTL, nil
	}))
	for _, sub := range []string{"", "/screenshots", "/movies"} {
		r.Get("/games/:id"+sub, p.handle(func(c fiber.Ctx) (string, url.Values, time.Duration, error) {
			id, err := positiveIDParam(c)
			return fmt.Sprintf("/games/%d%s", id, sub), nil, itemCacheTTL, err
		}))
	}
	r.Get("/genres", p.handle(func(fiber.Ctx) (string, url.Values, time.Duration, error) {
		return "/genres", url.Values{"page_size": {"40"}}, itemCacheTTL, nil
	}))
	r.Get("/platforms", p.handle(func(fiber.Ctx) (string, url.Values, time.Duration, error) {
		return "/platforms/lists/parents", nil, itemCacheTTL, nil
	}))
	r.Get("/developers", p.handle(func(c fiber.Ctx) (string, url.Values, time.Duration, error) {
		return "/developers", filterParams(c.Queries(), pagingParams), listCacheTTL, nil
	}))
	r.Get("/developers/:id", p.handle(func(c fiber.Ctx) (string, url.Values, time.Duration, error) {
		id, err := positiveIDParam(c)
		return fmt.Sprintf("/developers/%d", id), nil, itemCacheTTL, err
	}))
}

func positiveIDParam(c fiber.Ctx) (int, error) {
	id := fiber.Params[int](c, "id")
	if id <= 0 {
		return 0, fiber.NewError(fiber.StatusBadRequest, "id must be a positive integer")
	}
	return id, nil
}

type upstreamTarget func(c fiber.Ctx) (path string, params url.Values, ttl time.Duration, err error)

func (p *rawgProxy) handle(target upstreamTarget) fiber.Handler {
	return func(c fiber.Ctx) error {
		path, params, ttl, err := target(c)
		if err != nil {
			return err
		}
		if params == nil {
			params = url.Values{}
		}
		cacheKey := path + "?" + params.Encode()
		entry, ok := p.cached(cacheKey)
		if !ok {
			entry, err = p.fetch(c, path, params)
			if err != nil {
				log.Printf("rawg %s: %v", path, err)
				return fiber.NewError(fiber.StatusBadGateway, "Game data provider unavailable")
			}
			if entry.status == http.StatusOK {
				p.store(cacheKey, entry, ttl)
			}
		}
		switch {
		case entry.status == http.StatusOK:
			c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSONCharsetUTF8)
			return c.Send(entry.body)
		case entry.status == http.StatusNotFound:
			return fiber.NewError(fiber.StatusNotFound, "Not found")
		default:
			log.Printf("rawg %s: upstream status %d", path, entry.status)
			return fiber.NewError(fiber.StatusBadGateway, "Game data provider unavailable")
		}
	}
}

func (p *rawgProxy) fetch(c fiber.Ctx, path string, params url.Values) (cacheEntry, error) {
	q := url.Values{}
	for k, v := range params {
		q[k] = v
	}
	q.Set("key", p.key)
	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, p.base+path+"?"+q.Encode(), nil)
	if err != nil {
		return cacheEntry{}, err
	}
	req.Header.Set("User-Agent", "GamesRandomized/1.0")
	res, err := p.client.Do(req)
	if err != nil {
		// The URL carries the API key; never log it.
		return cacheEntry{}, fmt.Errorf("request failed: %w", unwrapURLError(err))
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 5<<20))
	if err != nil {
		return cacheEntry{}, err
	}
	return cacheEntry{status: res.StatusCode, body: body}, nil
}

func unwrapURLError(err error) error {
	if ue, ok := err.(*url.Error); ok {
		return ue.Err
	}
	return err
}

func (p *rawgProxy) cached(key string) (cacheEntry, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	e, ok := p.cache[key]
	if !ok || time.Now().After(e.expires) {
		return cacheEntry{}, false
	}
	return e, true
}

func (p *rawgProxy) store(key string, e cacheEntry, ttl time.Duration) {
	p.mu.Lock()
	defer p.mu.Unlock()
	// ponytail: in-process cache wiped when full; move to Redis/LRU if the api runs >1 instance.
	if len(p.cache) >= maxCacheSize {
		clear(p.cache)
	}
	e.expires = time.Now().Add(ttl)
	p.cache[key] = e
}
