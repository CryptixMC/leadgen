alter table leads
  add column if not exists possible_bad_fit boolean not null default false;
alter table leads
  add column if not exists bad_fit_reason text;
alter table leads
  add column if not exists contact_flagged boolean not null default false;
alter table leads
  add column if not exists contact_flag_reason text;
