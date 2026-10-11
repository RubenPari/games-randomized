package main

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type namedRef struct {
	ID   int    `json:"id" validate:"required"`
	Name string `json:"name" validate:"required,max=200"`
}

// gamePayload is what the frontend sends when saving a game (camelCase, RAWG fields only).
type gamePayload struct {
	RawgID          int        `json:"rawgId" validate:"required,gt=0"`
	Slug            string     `json:"slug" validate:"max=255"`
	Name            string     `json:"name" validate:"required,max=500"`
	Description     *string    `json:"description" validate:"omitempty,max=20000"`
	BackgroundImage *string    `json:"backgroundImage" validate:"omitempty,url,max=1000"`
	Released        *string    `json:"released" validate:"omitempty,max=20"`
	Rating          *float64   `json:"rating" validate:"omitempty,gte=0,lte=5"`
	RatingsCount    *int       `json:"ratingsCount" validate:"omitempty,gte=0"`
	Metacritic      *int       `json:"metacritic" validate:"omitempty,gte=0,lte=100"`
	Playtime        *int       `json:"playtime" validate:"omitempty,gte=0"`
	Genres          []namedRef `json:"genres" validate:"max=40,dive"`
	Platforms       []namedRef `json:"platforms" validate:"max=80,dive"`
}

type collectionItem struct {
	ID string `json:"id"`
	gamePayload
	CreatedAt time.Time `json:"createdAt"`
}

const itemColumns = `id, rawg_id, slug, name, description, background_image, released, rating,
	ratings_count, metacritic, playtime, genres, platforms, created_at`

func scanItem(row pgx.Row) (collectionItem, error) {
	var it collectionItem
	err := row.Scan(&it.ID, &it.RawgID, &it.Slug, &it.Name, &it.Description, &it.BackgroundImage,
		&it.Released, &it.Rating, &it.RatingsCount, &it.Metacritic, &it.Playtime,
		&it.Genres, &it.Platforms, &it.CreatedAt)
	if it.Genres == nil {
		it.Genres = []namedRef{}
	}
	if it.Platforms == nil {
		it.Platforms = []namedRef{}
	}
	return it, err
}

type collectionHandler struct {
	db *pgxpool.Pool
}

func notFound(list string) error {
	return fiber.NewError(fiber.StatusNotFound, "Item not found in "+list)
}

func rawgIDParam(c fiber.Ctx) (int, error) {
	id := fiber.Params[int](c, "rawgId")
	if id <= 0 {
		return 0, fiber.NewError(fiber.StatusBadRequest, "rawgId must be a positive integer")
	}
	return id, nil
}

func (h *collectionHandler) findAll(list string) fiber.Handler {
	return func(c fiber.Ctx) error {
		rows, err := h.db.Query(c,
			`SELECT `+itemColumns+` FROM collection_items WHERE user_id = $1 AND list = $2 ORDER BY created_at DESC`,
			currentUserID(c), list)
		if err != nil {
			return err
		}
		items, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (collectionItem, error) { return scanItem(r) })
		if err != nil {
			return err
		}
		return c.JSON(items)
	}
}

func (h *collectionHandler) findOne(list string) fiber.Handler {
	return func(c fiber.Ctx) error {
		id, err := rawgIDParam(c)
		if err != nil {
			return err
		}
		it, err := scanItem(h.db.QueryRow(c,
			`SELECT `+itemColumns+` FROM collection_items WHERE user_id = $1 AND list = $2 AND rawg_id = $3`,
			currentUserID(c), list, id))
		if err == pgx.ErrNoRows {
			return notFound(list)
		}
		if err != nil {
			return err
		}
		return c.JSON(it)
	}
}

// add is idempotent: saving a game twice returns the existing row.
func (h *collectionHandler) add(list string) fiber.Handler {
	return func(c fiber.Ctx) error {
		var p gamePayload
		if err := bindJSON(c, &p); err != nil {
			return err
		}
		if p.Genres == nil {
			p.Genres = []namedRef{}
		}
		if p.Platforms == nil {
			p.Platforms = []namedRef{}
		}
		userID := currentUserID(c)
		if _, err := h.db.Exec(c, `
			INSERT INTO collection_items (user_id, list, rawg_id, slug, name, description, background_image,
				released, rating, ratings_count, metacritic, playtime, genres, platforms)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
			ON CONFLICT (user_id, list, rawg_id) DO NOTHING`,
			userID, list, p.RawgID, p.Slug, p.Name, p.Description, p.BackgroundImage,
			p.Released, p.Rating, p.RatingsCount, p.Metacritic, p.Playtime, p.Genres, p.Platforms,
		); err != nil {
			return err
		}
		it, err := scanItem(h.db.QueryRow(c,
			`SELECT `+itemColumns+` FROM collection_items WHERE user_id = $1 AND list = $2 AND rawg_id = $3`,
			userID, list, p.RawgID))
		if err != nil {
			return err
		}
		return c.JSON(it)
	}
}

func (h *collectionHandler) remove(list string) fiber.Handler {
	return func(c fiber.Ctx) error {
		id, err := rawgIDParam(c)
		if err != nil {
			return err
		}
		tag, err := h.db.Exec(c,
			`DELETE FROM collection_items WHERE user_id = $1 AND list = $2 AND rawg_id = $3`,
			currentUserID(c), list, id)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return notFound(list)
		}
		return c.JSON(fiber.Map{"message": "Item removed from " + list})
	}
}
