-- ============================================================================
-- LeadGen — canonical Supabase schema setup / verification script
--
-- Run this in the Supabase dashboard SQL Editor (or `psql`) against your
-- project. Every statement is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS / DROP POLICY IF EXISTS + CREATE), so it is always safe to re-run
-- this whole file any time you want to true-up the schema — it will only
-- create what's missing and will never drop or overwrite existing data.
--
-- This consolidates: the original leads/clients/contact_events tables plus
-- every column added by supabase/migrations/*.sql, and enables RLS with
-- explicit service_role policies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. leads
-- ----------------------------------------------------------------------------
create table if not exists leads (
	id                        uuid primary key default gen_random_uuid(),
	business_name             text not null,
	address                   text,
	phone                     text,
	website_url               text,
	google_place_id           text unique,
	google_rating             float,
	review_count              int,
	has_gbp                   boolean,
	has_website               boolean,
	has_https                 boolean,
	pagespeed_mobile          int,
	pagespeed_desktop         int,
	pagespeed_seo             int,
	pagespeed_best_practices  int,
	mobile_friendly           boolean,
	website_inferred          boolean,
	website_screenshot        text,
	email                     text,
	site_age_estimate         text,
	also_on_yelp              boolean,
	yelp_url                  text,
	latitude                  float,
	longitude                 float,
	lead_score                int,
	priority                  text,
	status                    text not null default 'cold',
	notes                     text,
	hidden                    boolean not null default false,
	created_at                timestamptz not null default now(),
	last_updated              timestamptz not null default now()
);

-- Columns introduced by later migrations — re-declared here so this script
-- alone can bring an older/partial table up to date.
alter table leads
	add column if not exists facebook_url          text,
	add column if not exists instagram_url         text,
	add column if not exists twitter_url           text,
	add column if not exists linkedin_url          text,
	add column if not exists tiktok_url            text,
	add column if not exists youtube_url            text,
	add column if not exists opening_hours          text[],
	add column if not exists price_level            int,
	add column if not exists last_review_date       timestamptz,
	add column if not exists owner_response_rate    float,
	add column if not exists owner_name             text,
	add column if not exists linkedin_search_url    text,
	add column if not exists social_activity_score  int,
	add column if not exists website_source         text,
	add column if not exists category               text,
	add column if not exists gbp_social_url          text;

-- ----------------------------------------------------------------------------
-- 2. clients
-- ----------------------------------------------------------------------------
create table if not exists clients (
	id               uuid primary key default gen_random_uuid(),
	lead_id          uuid references leads(id) on delete set null,
	business_name    text not null,
	contact_name     text,
	phone            text,
	email            text,
	address          text,
	service_website  boolean not null default false,
	service_tools    boolean not null default false,
	service_hosting  boolean not null default false,
	mrr              numeric(8,2) not null default 0,
	project_value    numeric(8,2) not null default 0,
	contract_start   date,
	notes            text,
	created_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. contact_events
-- ----------------------------------------------------------------------------
create table if not exists contact_events (
	id         uuid primary key default gen_random_uuid(),
	lead_id    uuid not null references leads(id) on delete cascade,
	type       text not null,
	notes      text,
	created_at timestamptz not null default now()
);
create index if not exists contact_events_lead_id_idx on contact_events(lead_id);

-- ----------------------------------------------------------------------------
-- 4. Row Level Security
--
-- The app never queries these tables with the anon/authenticated key —
-- every read/write goes through src/lib/server/db.ts using the
-- SUPABASE_SERVICE_ROLE_KEY, gated by requireAuth() at the API layer.
-- RLS here is a default-deny backstop for anon/authenticated; service_role
-- is exempted explicitly below (it already bypasses RLS by default, but the
-- explicit policy removes any ambiguity).
-- ----------------------------------------------------------------------------
alter table leads enable row level security;
alter table clients enable row level security;
alter table contact_events enable row level security;

drop policy if exists "service_role_all_leads" on leads;
create policy "service_role_all_leads" on leads
	for all to service_role using (true) with check (true);

drop policy if exists "service_role_all_clients" on clients;
create policy "service_role_all_clients" on clients
	for all to service_role using (true) with check (true);

drop policy if exists "service_role_all_contact_events" on contact_events;
create policy "service_role_all_contact_events" on contact_events
	for all to service_role using (true) with check (true);

-- ----------------------------------------------------------------------------
-- 5. Diagnostics (run these separately if leads still fail to write)
-- ----------------------------------------------------------------------------
-- Confirms service_role has BYPASSRLS set (should be `true`):
--   select rolname, rolbypassrls from pg_roles where rolname = 'service_role';
--
-- Lists every policy currently on these three tables:
--   select schemaname, tablename, policyname, roles, cmd from pg_policies
--   where tablename in ('leads', 'clients', 'contact_events');
--
-- If writes still fail after running this file, the SUPABASE_SERVICE_ROLE_KEY
-- env var used by the app (Vercel project settings) is almost certainly not
-- the actual `service_role` secret from Supabase dashboard → Project
-- Settings → API — compare them directly, since no SQL script can fix a
-- misconfigured environment variable.
