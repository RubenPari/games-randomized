package main

import (
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const accessTokenTTL = 7 * 24 * time.Hour

var (
	validate        = newValidator()
	usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_]+$`)
	// Compared against when the username does not exist, so login timing does not leak which usernames exist.
	dummyHash, _ = bcrypt.GenerateFromPassword([]byte("timing-equalizer"), bcrypt.DefaultCost)
)

func newValidator() *validator.Validate {
	v := validator.New(validator.WithRequiredStructEnabled())
	v.RegisterTagNameFunc(func(f reflect.StructField) string {
		return strings.Split(f.Tag.Get("json"), ",")[0]
	})
	return v
}

// bindJSON parses and validates a request body, turning any failure into a 400.
func bindJSON(c fiber.Ctx, out any) error {
	if err := c.Bind().JSON(out); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Invalid JSON body")
	}
	if err := validate.Struct(out); err != nil {
		var ve validator.ValidationErrors
		if errors.As(err, &ve) && len(ve) > 0 {
			f := ve[0]
			msg := fmt.Sprintf("%s failed validation: %s", f.Field(), f.Tag())
			if f.Param() != "" {
				msg += "=" + f.Param()
			}
			return fiber.NewError(fiber.StatusBadRequest, msg)
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return nil
}

type authHandler struct {
	db     *pgxpool.Pool
	secret []byte
}

type userResponse struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

type loginResponse struct {
	Token string       `json:"token"`
	User  userResponse `json:"user"`
}

type registerRequest struct {
	Username string `json:"username" validate:"required,min=3,max=30"`
	Email    string `json:"email" validate:"required,email,max=255"`
	// bcrypt ignores bytes past 72, so reject longer passwords instead of silently truncating.
	Password string `json:"password" validate:"required,min=8,max=72"`
}

type loginRequest struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" validate:"required"`
	NewPassword     string `json:"newPassword" validate:"required,min=8,max=72"`
}

type tokenClaims struct {
	jwt.RegisteredClaims
	// Version must match users.token_version; changing the password bumps it and revokes old tokens.
	Version int `json:"ver"`
}

func (h *authHandler) issueToken(userID string, version int) (string, error) {
	now := time.Now()
	return jwt.NewWithClaims(jwt.SigningMethodHS256, tokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(accessTokenTTL)),
		},
		Version: version,
	}).SignedString(h.secret)
}

func (h *authHandler) parseToken(raw string) (*tokenClaims, error) {
	claims := &tokenClaims{}
	_, err := jwt.ParseWithClaims(raw, claims, func(*jwt.Token) (any, error) { return h.secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}
	if claims.Subject == "" {
		return nil, errors.New("token has no subject")
	}
	return claims, nil
}

// requireUser checks the signature and that the user still exists with the same token version.
func (h *authHandler) requireUser(c fiber.Ctx) error {
	unauthorized := fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	raw, ok := strings.CutPrefix(c.Get(fiber.HeaderAuthorization), "Bearer ")
	if !ok || raw == "" {
		return unauthorized
	}
	claims, err := h.parseToken(raw)
	if err != nil {
		return unauthorized
	}
	var version int
	err = h.db.QueryRow(c, `SELECT token_version FROM users WHERE id = $1`, claims.Subject).Scan(&version)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && version != claims.Version) {
		return unauthorized
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "22P02" { // subject is not a uuid
			return unauthorized
		}
		return err
	}
	c.Locals("userID", claims.Subject)
	return c.Next()
}

func currentUserID(c fiber.Ctx) string {
	return fiber.Locals[string](c, "userID")
}

func (h *authHandler) register(c fiber.Ctx) error {
	var req registerRequest
	if err := bindJSON(c, &req); err != nil {
		return err
	}
	if !usernamePattern.MatchString(req.Username) {
		return fiber.NewError(fiber.StatusBadRequest, "username must contain only letters, numbers and underscores")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	var id string
	err = h.db.QueryRow(c,
		`INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id`,
		req.Username, email, string(hash),
	).Scan(&id)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return fiber.NewError(fiber.StatusConflict, "Username or email already exists")
	}
	if err != nil {
		return err
	}
	return h.respondWithToken(c, userResponse{ID: id, Username: req.Username, Email: email}, 0)
}

func (h *authHandler) login(c fiber.Ctx) error {
	var req loginRequest
	if err := bindJSON(c, &req); err != nil {
		return err
	}
	var u userResponse
	var hash string
	var version int
	err := h.db.QueryRow(c,
		`SELECT id, username, email, password, token_version FROM users WHERE username = $1`, req.Username,
	).Scan(&u.ID, &u.Username, &u.Email, &hash, &version)
	if errors.Is(err, pgx.ErrNoRows) {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(req.Password))
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid credentials")
	}
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid credentials")
	}
	return h.respondWithToken(c, u, version)
}

func (h *authHandler) respondWithToken(c fiber.Ctx, u userResponse, version int) error {
	token, err := h.issueToken(u.ID, version)
	if err != nil {
		return err
	}
	return c.JSON(loginResponse{Token: token, User: u})
}

func (h *authHandler) me(c fiber.Ctx) error {
	var u userResponse
	err := h.db.QueryRow(c,
		`SELECT id, username, email FROM users WHERE id = $1`, currentUserID(c),
	).Scan(&u.ID, &u.Username, &u.Email)
	if errors.Is(err, pgx.ErrNoRows) {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}
	if err != nil {
		return err
	}
	return c.JSON(u)
}

func (h *authHandler) changePassword(c fiber.Ctx) error {
	var req changePasswordRequest
	if err := bindJSON(c, &req); err != nil {
		return err
	}
	userID := currentUserID(c)
	var hash string
	err := h.db.QueryRow(c, `SELECT password FROM users WHERE id = $1`, userID).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return fiber.NewError(fiber.StatusUnauthorized, "Unauthorized")
	}
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.CurrentPassword)) != nil {
		return fiber.NewError(fiber.StatusBadRequest, "Current password is incorrect")
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	var version int
	if err := h.db.QueryRow(c,
		`UPDATE users SET password = $1, token_version = token_version + 1, updated_at = now()
		 WHERE id = $2 RETURNING token_version`, string(newHash), userID,
	).Scan(&version); err != nil {
		return err
	}
	// Every other session is now revoked; hand this one a fresh token so it stays logged in.
	token, err := h.issueToken(userID, version)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"message": "Password changed successfully", "token": token})
}
