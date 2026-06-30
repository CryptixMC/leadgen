alter table leads
  add column if not exists opening_hours       text[],
  add column if not exists price_level         int,
  add column if not exists last_review_date    timestamptz,
  add column if not exists owner_response_rate float,
  add column if not exists owner_name          text,
  add column if not exists linkedin_search_url text,
  add column if not exists social_activity_score int;
