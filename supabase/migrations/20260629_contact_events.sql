create table contact_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  type       text not null,
  notes      text,
  created_at timestamptz not null default now()
);
create index contact_events_lead_id_idx on contact_events(lead_id);
