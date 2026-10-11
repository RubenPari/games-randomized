package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
)

func TestTokenRoundTripAndRejection(t *testing.T) {
	h := &authHandler{secret: []byte(strings.Repeat("s", 32))}
	tok, err := h.issueToken("user-1", 3)
	if err != nil {
		t.Fatal(err)
	}
	if claims, err := h.parseToken(tok); err != nil || claims.Subject != "user-1" || claims.Version != 3 {
		t.Fatalf("valid token: claims=%+v err=%v", claims, err)
	}

	tampered := tok[:len(tok)-2] + "xx"
	if _, err := h.parseToken(tampered); err == nil {
		t.Fatal("tampered token accepted")
	}

	other := &authHandler{secret: []byte(strings.Repeat("o", 32))}
	if _, err := other.parseToken(tok); err == nil {
		t.Fatal("token signed with another secret accepted")
	}

	expired, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject:   "user-1",
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Minute)),
	}).SignedString(h.secret)
	if _, err := h.parseToken(expired); err == nil {
		t.Fatal("expired token accepted")
	}

	noExpiry, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{Subject: "user-1"}).SignedString(h.secret)
	if _, err := h.parseToken(noExpiry); err == nil {
		t.Fatal("token without expiry accepted")
	}
}

func TestRAWGProxyFiltersParamsAndCaches(t *testing.T) {
	var hits atomic.Int32
	var lastQuery atomic.Value
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		lastQuery.Store(r.URL.Query())
		if r.URL.Path == "/games/404" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.URL.Path == "/games/7" {
			_, _ = io.WriteString(w, strings.Repeat("x", maxEntryBytes+1))
			return
		}
		_, _ = io.WriteString(w, `{"count":1,"results":[]}`)
	}))
	defer upstream.Close()

	p := newRAWGProxy("secret-key")
	p.base = upstream.URL
	app := fiber.New(fiber.Config{ErrorHandler: errorHandler})
	p.register(app)

	get := func(path string) int {
		res, err := app.Test(httptest.NewRequest(http.MethodGet, path, nil))
		if err != nil {
			t.Fatal(err)
		}
		return res.StatusCode
	}

	if code := get("/games?genres=4&key=attacker&evil=1&page=2"); code != http.StatusOK {
		t.Fatalf("status %d", code)
	}
	q := lastQuery.Load().(url.Values)
	if got := q["key"]; len(got) != 1 || got[0] != "secret-key" {
		t.Fatalf("key forwarded wrong: %v", got)
	}
	if _, ok := q["evil"]; ok {
		t.Fatal("unknown param forwarded")
	}
	if q["genres"][0] != "4" || q["page"][0] != "2" {
		t.Fatalf("allowed params lost: %v", q)
	}

	get("/games?page=2&genres=4") // same params, different order: cache hit
	if hits.Load() != 1 {
		t.Fatalf("expected cache hit, upstream hits=%d", hits.Load())
	}

	before := hits.Load()
	get("/games/7")
	get("/games/7")
	if hits.Load()-before != 2 {
		t.Fatal("oversized response was cached")
	}
	if p.cacheBytes > maxCacheBytes {
		t.Fatalf("cache over budget: %d", p.cacheBytes)
	}

	if code := get("/games/404"); code != http.StatusNotFound {
		t.Fatalf("upstream 404 mapped to %d", code)
	}
	if code := get("/games/abc"); code != http.StatusBadRequest {
		t.Fatalf("non-numeric id mapped to %d", code)
	}
}

// TestCollectionsFlow runs against a real Postgres when TEST_DATABASE_URL is set,
// e.g. TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/games_test?sslmode=disable
func TestCollectionsFlow(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	cfg := config{DatabaseURL: dsn, JWTSecret: strings.Repeat("t", 32), RAWGKey: "unused", FrontendURL: "http://localhost"}
	pool, err := openPool(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	app := newApp(cfg, pool)

	call := func(method, path, token, body string, out any) int {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		if out != nil {
			_ = json.NewDecoder(res.Body).Decode(out)
		}
		return res.StatusCode
	}

	username := fmt.Sprintf("tester_%d", time.Now().UnixNano()%1_000_000_000)
	var login loginResponse
	if code := call("POST", "/api/auth/register", "",
		fmt.Sprintf(`{"username":%q,"email":"%s@example.com","password":"password123"}`, username, username), &login); code != 200 {
		t.Fatalf("register %d", code)
	}
	defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, login.User.ID)

	if code := call("GET", "/api/wishlist", "", "", nil); code != 401 {
		t.Fatalf("unauthenticated wishlist %d", code)
	}

	game := `{"rawgId":3498,"slug":"gta-v","name":"Grand Theft Auto V","rating":4.47,"metacritic":92,
		"genres":[{"id":4,"name":"Action"}],"platforms":[{"id":1,"name":"PC"}]}`
	for range 2 { // second add must be idempotent
		if code := call("POST", "/api/wishlist", login.Token, game, nil); code != 200 {
			t.Fatalf("add %d", code)
		}
	}
	if code := call("POST", "/api/wishlist", login.Token, `{"rawgId":0,"name":""}`, nil); code != 400 {
		t.Fatalf("invalid payload %d", code)
	}

	var items []collectionItem
	call("GET", "/api/wishlist", login.Token, "", &items)
	if len(items) != 1 || items[0].Name != "Grand Theft Auto V" || len(items[0].Genres) != 1 {
		t.Fatalf("wishlist = %+v", items)
	}
	call("GET", "/api/discovered", login.Token, "", &items)
	if len(items) != 0 {
		t.Fatalf("lists leaked into each other: %+v", items)
	}

	if code := call("DELETE", "/api/wishlist/3498", login.Token, "", nil); code != 200 {
		t.Fatalf("delete %d", code)
	}
	if code := call("DELETE", "/api/wishlist/3498", login.Token, "", nil); code != 404 {
		t.Fatalf("second delete %d", code)
	}

	if code := call("POST", "/api/auth/change-password", login.Token,
		`{"currentPassword":"wrong-pass","newPassword":"newpassword123"}`, nil); code != 400 {
		t.Fatalf("wrong current password %d", code)
	}
	var changed struct {
		Token string `json:"token"`
	}
	if code := call("POST", "/api/auth/change-password", login.Token,
		`{"currentPassword":"password123","newPassword":"newpassword123"}`, &changed); code != 200 {
		t.Fatalf("change password %d", code)
	}
	if code := call("GET", "/api/auth/me", login.Token, "", nil); code != 401 {
		t.Fatalf("token issued before password change still accepted: %d", code)
	}
	if code := call("GET", "/api/auth/me", changed.Token, "", nil); code != 200 {
		t.Fatalf("token returned by change-password rejected: %d", code)
	}
	if code := call("POST", "/api/auth/login", "",
		fmt.Sprintf(`{"username":%q,"password":"newpassword123"}`, username), nil); code != 200 {
		t.Fatalf("login with new password %d", code)
	}
}

// Rotating X-Forwarded-For must not reset the 5/min auth limiter.
func TestAuthRateLimitIgnoresForwardedFor(t *testing.T) {
	app := newApp(config{JWTSecret: strings.Repeat("t", 32), RAWGKey: "unused", FrontendURL: "http://localhost"}, nil)
	last := 0
	for i := range 6 {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-For", fmt.Sprintf("203.0.113.%d", i))
		res, err := app.Test(req)
		if err != nil {
			t.Fatal(err)
		}
		last = res.StatusCode
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("6th login attempt got %d, want 429", last)
	}
}
