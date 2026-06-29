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
