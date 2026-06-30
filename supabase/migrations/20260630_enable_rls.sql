-- Defense-in-depth: the app only ever accesses these tables through the
-- server-side service-role client (which bypasses RLS by design), gated by
-- requireAuth() at the API layer. Enabling RLS with no policies makes that the
-- enforced default for any other role (e.g. the anon key) too, in case it is
-- ever used for direct queries in the future.
alter table leads enable row level security;
alter table clients enable row level security;
alter table contact_events enable row level security;
