alter table leads
  add column if not exists email_unverified boolean not null default false;
