-- https://www.postgresql.org/docs/current/uuid-ossp.html
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- forcefully drop our tables if they already exist
-- likes first: it references users and activities.
DROP TABLE IF EXISTS public.likes;
DROP TABLE IF EXISTS public.users cascade;
DROP TABLE IF EXISTS public.activities;

CREATE TABLE public.users (
  uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  display_name text NOT NULL,
  email text NOT NULL,
  handle text NOT NULL,
  -- UNIQUE (backlog #50): one row per Cognito account. Same constraint name
  -- (users_cognito_user_id_key) as migration 17800000000000003 creates.
  cognito_user_id text NOT NULL UNIQUE,
  created_at TIMESTAMP default current_timestamp NOT NULL,
  bio text
);

CREATE TABLE public.activities (
  uuid UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_uuid UUID NOT NULL,
  message text NOT NULL,
  replies_count integer DEFAULT 0,
  reposts_count integer DEFAULT 0,
  likes_count integer DEFAULT 0,
  reply_to_activity_uuid UUID,
  expires_at TIMESTAMP,
  created_at TIMESTAMP default current_timestamp NOT NULL
);

-- One row per (user, activity). The primary key makes a double like
-- impossible; activities.likes_count is kept in step by like.sql/unlike.sql.
CREATE TABLE public.likes (
  user_uuid UUID NOT NULL REFERENCES public.users(uuid) ON DELETE CASCADE,
  activity_uuid UUID NOT NULL REFERENCES public.activities(uuid) ON DELETE CASCADE,
  created_at TIMESTAMP default current_timestamp NOT NULL,
  PRIMARY KEY (user_uuid, activity_uuid)
);

-- Migration tracking table — DO NOT DROP this table
-- It persists across schema reloads to track which migrations have run
CREATE TABLE IF NOT EXISTS public.schema_information (
  id integer UNIQUE,
  last_successful_run varchar(256)
);

-- This file creates the tables in their CURRENT shape: every migration up to
-- and including the prefix below is already folded in (users.bio, uuid
-- reply_to_activity_uuid, likes table, unique users.cognito_user_id). Loading it must therefore RESET the stamp to that
-- prefix. Otherwise bin/db/migrate would re-run folded migrations and fail
-- ("column bio already exists"), or a stale stamp would skip real ones.
-- When you add a migration: fold it in here AND bump this value.
INSERT INTO public.schema_information (id, last_successful_run)
VALUES (1, '17800000000000003')
ON CONFLICT (id) DO UPDATE SET last_successful_run = EXCLUDED.last_successful_run;