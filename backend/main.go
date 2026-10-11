package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/helmet"
	"github.com/gofiber/fiber/v3/middleware/limiter"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type config struct {
	Port         string
	DatabaseURL  string
	DBSSLCA      string
	JWTSecret    string
	RAWGKey      string
	FrontendURL  string
	AIGatewayURL string
	AIGatewayKey string
	AIModel      string
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loadConfig() (config, error) {
	c := config{
		Port:         env("PORT", "8000"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		DBSSLCA:      os.Getenv("DB_SSL_CA"),
		JWTSecret:    os.Getenv("JWT_SECRET"),
		RAWGKey:      os.Getenv("RAWG_API_KEY"),
		FrontendURL:  env("FRONTEND_URL", "http://localhost:4200"),
		AIGatewayURL: os.Getenv("AI_GATEWAY_URL"),
		AIGatewayKey: os.Getenv("AI_GATEWAY_KEY"),
		AIModel:      env("AI_MODEL", "gpt-4o-mini"),
	}
	if c.DatabaseURL == "" {
		sslmode := "disable"
		if os.Getenv("DB_SSL") == "true" {
			sslmode = "require"
		}
		u := url.URL{
			Scheme:   "postgres",
			User:     url.UserPassword(env("DB_USERNAME", "postgres"), os.Getenv("DB_PASSWORD")),
			Host:     net.JoinHostPort(env("DB_HOST", "localhost"), env("DB_PORT", "5432")),
			Path:     "/" + env("DB_DATABASE", "games_randomized"),
			RawQuery: "sslmode=" + sslmode,
		}
		c.DatabaseURL = u.String()
	}
	if len(c.JWTSecret) < 32 {
		return c, errors.New("JWT_SECRET must be at least 32 characters")
	}
	if c.RAWGKey == "" {
		return c, errors.New("RAWG_API_KEY is required")
	}
	return c, nil
}

func openPool(ctx context.Context, c config) (*pgxpool.Pool, error) {
	pc, err := pgxpool.ParseConfig(c.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	if c.DBSSLCA != "" {
		roots := x509.NewCertPool()
		if !roots.AppendCertsFromPEM([]byte(c.DBSSLCA)) {
			return nil, errors.New("DB_SSL_CA is not a valid PEM certificate")
		}
		// sslmode=require alone skips verification; with a CA we verify the server.
		tlsCfg := &tls.Config{RootCAs: roots, ServerName: pc.ConnConfig.Host, MinVersion: tls.VersionTLS12}
		pc.ConnConfig.TLSConfig = tlsCfg
		for _, fb := range pc.ConnConfig.Fallbacks {
			if fb.TLSConfig != nil {
				fb.TLSConfig = tlsCfg
			}
		}
	}
	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return pool, nil
}

func migrate(ctx context.Context, pool *pgxpool.Pool) error {
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()
	sub, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		return err
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, db, sub)
	if err != nil {
		return err
	}
	_, err = provider.Up(ctx)
	return err
}

// errorHandler mirrors the film backend: { statusCode, message, error }.
func errorHandler(c fiber.Ctx, err error) error {
	code := fiber.StatusInternalServerError
	message := "Internal server error"
	var fe *fiber.Error
	if errors.As(err, &fe) {
		code = fe.Code
		message = fe.Message
	} else {
		log.Printf("unhandled error on %s %s: %v", c.Method(), c.Path(), err)
	}
	return c.Status(code).JSON(fiber.Map{
		"statusCode": code,
		"message":    message,
		"error":      http.StatusText(code),
	})
}

func newApp(c config, pool *pgxpool.Pool) *fiber.App {
	app := fiber.New(fiber.Config{
		ErrorHandler: errorHandler,
		BodyLimit:    1 << 20,
		// nginx overwrites X-Real-IP with the client address (see nginx.conf.template), so clients
		// cannot spoof it; it is only trusted when the request comes from a private-network proxy.
		ProxyHeader:        "X-Real-IP",
		TrustProxy:         true,
		TrustProxyConfig:   fiber.TrustProxyConfig{Private: true, Loopback: true},
		EnableIPValidation: true,
	})

	app.Use(recover.New(), logger.New(), helmet.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:     splitTrim(c.FrontendURL),
		AllowHeaders:     []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	api := app.Group("/api")
	api.Get("/health", func(ctx fiber.Ctx) error {
		pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		if err := pool.Ping(pingCtx); err != nil {
			return ctx.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"status": "error", "database": "down"})
		}
		return ctx.JSON(fiber.Map{"status": "ok", "database": "up"})
	})

	api.Use(limiter.New(limiter.Config{Max: 60, Expiration: time.Minute}))

	auth := &authHandler{db: pool, secret: []byte(c.JWTSecret)}
	strict := limiter.New(limiter.Config{Max: 5, Expiration: time.Minute})
	api.Post("/auth/register", strict, auth.register)
	api.Post("/auth/login", strict, auth.login)

	protected := api.Group("", auth.requireUser)
	protected.Get("/auth/me", auth.me)
	protected.Post("/auth/change-password", auth.changePassword)

	collections := &collectionHandler{db: pool}
	for _, list := range []string{"wishlist", "discovered"} {
		protected.Get("/"+list, collections.findAll(list))
		protected.Post("/"+list, collections.add(list))
		protected.Get("/"+list+"/:rawgId", collections.findOne(list))
		protected.Delete("/"+list+"/:rawgId", collections.remove(list))
	}

	newRAWGProxy(c.RAWGKey).register(protected)

	rec := &recommender{gatewayURL: c.AIGatewayURL, gatewayKey: c.AIGatewayKey, model: c.AIModel}
	protected.Post("/recommend/explain", rec.explain)

	return app
}

func splitTrim(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func main() {
	c, err := loadConfig()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := openPool(ctx, c)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	if err := migrate(ctx, pool); err != nil {
		log.Fatalf("migrations: %v", err)
	}

	app := newApp(c, pool)
	go func() {
		<-ctx.Done()
		_ = app.ShutdownWithTimeout(10 * time.Second)
	}()
	if err := app.Listen(":"+c.Port, fiber.ListenConfig{DisableStartupMessage: true}); err != nil {
		log.Fatalf("listen: %v", err)
	}
}
