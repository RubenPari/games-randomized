-- +goose Up
CREATE TABLE users (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username   varchar(64)  NOT NULL UNIQUE,
    email      varchar(255) NOT NULL UNIQUE,
    password   text         NOT NULL,
    created_at timestamptz  NOT NULL DEFAULT now(),
    updated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE TYPE collection_list AS ENUM ('wishlist', 'discovered');

CREATE TABLE collection_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid            NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    list             collection_list NOT NULL,
    rawg_id          integer         NOT NULL CHECK (rawg_id > 0),
    slug             text            NOT NULL DEFAULT '',
    name             text            NOT NULL,
    description      text,
    background_image text,
    released         text,
    rating           real,
    ratings_count    integer,
    metacritic       integer,
    playtime         integer,
    genres           jsonb           NOT NULL DEFAULT '[]',
    platforms        jsonb           NOT NULL DEFAULT '[]',
    created_at       timestamptz     NOT NULL DEFAULT now(),
    UNIQUE (user_id, list, rawg_id)
);

-- +goose Down
DROP TABLE collection_items;
DROP TYPE collection_list;
DROP TABLE users;
