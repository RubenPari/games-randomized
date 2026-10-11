-- +goose Up
-- Bumped on password change: tokens carrying an older version are rejected.
ALTER TABLE users ADD COLUMN token_version integer NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE users DROP COLUMN token_version;
