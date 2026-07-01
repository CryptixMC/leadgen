-- service_role already bypasses RLS by design, so these policies are a no-op in the
-- normal case. They exist as a belt-and-suspenders guarantee that the app's own
-- server-side writes (scraper, enrichment, rescoring) are never blocked by RLS,
-- regardless of any project-specific role/key configuration.
create policy "service_role_all_leads" on leads
	for all to service_role using (true) with check (true);

create policy "service_role_all_clients" on clients
	for all to service_role using (true) with check (true);

create policy "service_role_all_contact_events" on contact_events
	for all to service_role using (true) with check (true);
