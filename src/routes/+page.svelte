<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Lead } from '$lib/api';
	import { batchDeleteLeads, createLead, enrichLead } from '$lib/api';

	let { data }: { data: PageData } = $props();

	let statusFilter = $state('');
	let priorityFilter = $state('');
	let sortAsc = $state(false);
	let selected = $state(new Set<string>());
	let deleting = $state(false);
	let enriching = $state(false);
	let enrichProgress = $state({ done: 0, total: 0 });
	let enrichCurrentName = $state('');

	let showCreateModal = $state(false);
	let createLoading = $state(false);
	let createError = $state('');
	let createForm = $state({
		business_name: '',
		address: '',
		phone: '',
		website_url: '',
		email: '',
		google_rating: 0,
		review_count: 0,
		notes: ''
	});

	function openCreateModal() {
		createForm = { business_name: '', address: '', phone: '', website_url: '', email: '', google_rating: 0, review_count: 0, notes: '' };
		createError = '';
		showCreateModal = true;
	}

	function closeCreateModal() {
		showCreateModal = false;
	}

	async function handleCreateLead(e: Event) {
		e.preventDefault();
		createError = '';
		createLoading = true;
		try {
			const payload: Record<string, unknown> = {
				business_name: createForm.business_name.trim(),
				address: createForm.address.trim(),
				phone: createForm.phone.trim(),
				google_rating: Number(createForm.google_rating) || 0,
				review_count: Number(createForm.review_count) || 0
			};
			if (createForm.website_url.trim()) payload.website_url = createForm.website_url.trim();
			if (createForm.email.trim()) payload.email = createForm.email.trim();
			if (createForm.notes.trim()) payload.notes = createForm.notes.trim();
			await createLead(payload);
			showCreateModal = false;
			await invalidateAll();
		} catch (err) {
			createError = err instanceof Error ? err.message : 'Failed to create lead';
		} finally {
			createLoading = false;
		}
	}

	const STATUSES = ['', 'cold', 'contacted', 'proposal', 'closed_won', 'closed_lost'];
	const PRIORITIES = ['', 'high', 'medium', 'low'];

	const filtered = $derived(
		(data.leads as Lead[])
			.filter((l) => (statusFilter ? l.status === statusFilter : true))
			.filter((l) => (priorityFilter ? l.priority === priorityFilter : true))
			.sort((a, b) => {
				const as = a.lead_score ?? 0;
				const bs = b.lead_score ?? 0;
				return sortAsc ? as - bs : bs - as;
			})
	);

	const allFilteredSelected = $derived(
		filtered.length > 0 && filtered.every((l) => selected.has(l.id))
	);

	function toggleSelect(id: string, e: Event) {
		e.stopPropagation();
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	function toggleSelectAll(e: Event) {
		e.stopPropagation();
		if (allFilteredSelected) {
			const next = new Set(selected);
			filtered.forEach((l) => next.delete(l.id));
			selected = next;
		} else {
			const next = new Set(selected);
			filtered.forEach((l) => next.add(l.id));
			selected = next;
		}
	}

	async function enrichSelected() {
		if (selected.size === 0) return;
		enriching = true;
		const ids = [...selected];
		enrichProgress = { done: 0, total: ids.length };
		try {
			for (const id of ids) {
				const lead = (data.leads as { id: string; business_name: string }[]).find((l) => l.id === id);
				enrichCurrentName = lead?.business_name ?? '';
				await enrichLead(id);
				enrichProgress = { ...enrichProgress, done: enrichProgress.done + 1 };
			}
			enrichCurrentName = '';
			selected = new Set();
			await invalidateAll();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Enrich failed');
		} finally {
			enriching = false;
			enrichProgress = { done: 0, total: 0 };
			enrichCurrentName = '';
		}
	}

	async function deleteSelected() {
		if (selected.size === 0) return;
		if (!confirm(`Delete ${selected.size} lead${selected.size === 1 ? '' : 's'}? This cannot be undone.`)) return;
		deleting = true;
		try {
			await batchDeleteLeads([...selected]);
			selected = new Set();
			await invalidateAll();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Delete failed');
		} finally {
			deleting = false;
		}
	}

	function priorityClass(p: string | null) {
		if (p === 'high') return 'badge badge-high';
		if (p === 'medium') return 'badge badge-medium';
		return 'badge badge-low';
	}

	function statusClass(s: string) {
		if (s === 'closed_won') return 'badge badge-won';
		if (s === 'closed_lost') return 'badge badge-lost';
		if (s === 'proposal') return 'badge badge-proposal';
		if (s === 'contacted') return 'badge badge-contacted';
		return 'badge badge-cold';
	}
</script>

<svelte:head>
	<title>LeadGen — Dashboard</title>
</svelte:head>

<main>
	<div class="header">
		<h1>Lead Dashboard</h1>
		<span class="count">{filtered.length} leads</span>
	</div>

	<div class="controls">
		<div class="filters">
			<label>
				<span>Status</span>
				<select bind:value={statusFilter}>
					{#each STATUSES as s}
						<option value={s}>{s || 'All'}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>Priority</span>
				<select bind:value={priorityFilter}>
					{#each PRIORITIES as p}
						<option value={p}>{p || 'All'}</option>
					{/each}
				</select>
			</label>
		</div>
		<div class="right-controls">
			{#if selected.size > 0}
				<button class="enrich-btn" onclick={enrichSelected} disabled={enriching || deleting}>
					{enriching
						? `Enriching ${enrichProgress.done}/${enrichProgress.total}…`
						: `Enrich ${selected.size} selected`}
				</button>
				<button class="delete-btn" onclick={deleteSelected} disabled={deleting || enriching}>
					{deleting ? 'Deleting…' : `Delete ${selected.size} selected`}
				</button>
			{/if}
			<button class="sort-btn" onclick={() => (sortAsc = !sortAsc)}>
				Score {sortAsc ? '↑' : '↓'}
			</button>
			<button class="new-lead-btn" onclick={openCreateModal}>+ New Lead</button>
		</div>
	</div>

	{#if enriching && enrichProgress.total > 0}
		{@const pct = Math.round((enrichProgress.done / enrichProgress.total) * 100)}
		<div class="enrich-progress">
			<div class="progress-track">
				<div class="progress-fill" style="width: {pct}%"></div>
			</div>
			{#if enrichCurrentName}
				<div class="progress-lead-name">{enrichCurrentName}</div>
			{/if}
		</div>
	{/if}

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th class="check-col">
						<input
							type="checkbox"
							checked={allFilteredSelected}
							indeterminate={selected.size > 0 && !allFilteredSelected}
							onclick={toggleSelectAll}
						/>
					</th>
					<th>Business</th>
					<th>Address</th>
					<th>Website</th>
					<th>Email</th>
					<th class="num" onclick={() => (sortAsc = !sortAsc)}>Score</th>
					<th>Priority</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as lead (lead.id)}
					<tr
						onclick={() => (window.location.href = `/leads/${lead.id}`)}
						class:row-selected={selected.has(lead.id)}
					>
						<td class="check-col" onclick={(e) => toggleSelect(lead.id, e)}>
							<input type="checkbox" checked={selected.has(lead.id)} onclick={(e) => e.stopPropagation()} />
						</td>
						<td class="name">
							{lead.business_name}
							<a
								href={`https://www.google.com/maps/place/?q=place_id:${lead.google_place_id}`}
								target="_blank"
								rel="noopener noreferrer"
								onclick={(e) => e.stopPropagation()}
								class="maps-link"
								title="View on Google Maps"
							>Maps</a>
						</td>
						<td class="addr">{lead.address}</td>
						<td>
							{#if lead.website_url}
								<a
									href={lead.website_url}
									target="_blank"
									rel="noopener noreferrer"
									onclick={(e) => e.stopPropagation()}
									class="site-link"
								>
									{new URL(lead.website_url).hostname}
								</a>
								{#if lead.website_inferred}
									<span class="inferred-badge" title="Found via web search — not listed on Google profile">!</span>
								{/if}
							{:else}
								<span class="none">—</span>
							{/if}
						</td>
						<td>
							{#if lead.email}
								<a
									href={`mailto:${lead.email}`}
									onclick={(e) => e.stopPropagation()}
									class="email-link"
								>{lead.email}</a>
							{:else}
								<span class="none">—</span>
							{/if}
						</td>
						<td class="num score">{lead.lead_score ?? '—'}</td>
						<td><span class={priorityClass(lead.priority)}>{lead.priority ?? '—'}</span></td>
						<td><span class={statusClass(lead.status)}>{lead.status}</span></td>
					</tr>
				{/each}
				{#if filtered.length === 0}
					<tr>
						<td colspan="8" class="empty">No leads match your filters.</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</main>

{#if showCreateModal}
	<div class="modal-backdrop" onclick={closeCreateModal} role="dialog" aria-modal="true">
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>New Lead</h2>
				<button class="modal-close" onclick={closeCreateModal} aria-label="Close">✕</button>
			</div>
			<form onsubmit={handleCreateLead}>
				<div class="form-grid">
					<label class="field">
						<span>Business Name <span class="required">*</span></span>
						<input type="text" bind:value={createForm.business_name} required placeholder="Acme Plumbing Co." />
					</label>
					<label class="field">
						<span>Phone <span class="required">*</span></span>
						<input type="text" bind:value={createForm.phone} required placeholder="(204) 555-0100" />
					</label>
					<label class="field field-full">
						<span>Address <span class="required">*</span></span>
						<input type="text" bind:value={createForm.address} required placeholder="123 Main St, Winnipeg, MB" />
					</label>
					<label class="field">
						<span>Website URL</span>
						<input type="url" bind:value={createForm.website_url} placeholder="https://example.com" />
					</label>
					<label class="field">
						<span>Email</span>
						<input type="email" bind:value={createForm.email} placeholder="owner@example.com" />
					</label>
					<label class="field">
						<span>Google Rating</span>
						<input type="number" bind:value={createForm.google_rating} min="0" max="5" step="0.1" placeholder="4.2" />
					</label>
					<label class="field">
						<span>Review Count</span>
						<input type="number" bind:value={createForm.review_count} min="0" placeholder="47" />
					</label>
					<label class="field field-full">
						<span>Notes</span>
						<textarea bind:value={createForm.notes} rows="3" placeholder="Anything worth noting…"></textarea>
					</label>
				</div>
				{#if createError}
					<p class="form-error">{createError}</p>
				{/if}
				<div class="modal-footer">
					<button type="button" class="cancel-btn" onclick={closeCreateModal}>Cancel</button>
					<button type="submit" class="submit-btn" disabled={createLoading}>
						{createLoading ? 'Creating…' : 'Create Lead'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	main {
		padding: 2rem;
		max-width: 1400px;
		margin: 0 auto;
	}

	.header {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	h1 {
		font-size: 1.5rem;
		color: #f1f5f9;
	}

	.count {
		color: #64748b;
		font-size: 0.85rem;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.25rem;
		flex-wrap: wrap;
	}

	.filters {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: #94a3b8;
	}

	select {
		background: #13131f;
		border: 1px solid #2a2a3e;
		color: #e2e8f0;
		padding: 0.35rem 0.6rem;
		border-radius: 6px;
		cursor: pointer;
		outline: none;
	}

	select:focus {
		border-color: #7c3aed;
	}

	.right-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}

	.sort-btn {
		background: transparent;
		border: 1px solid #2a2a3e;
		color: #94a3b8;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		transition: border-color 0.15s, color 0.15s;
	}

	.sort-btn:hover {
		border-color: #7c3aed;
		color: #7c3aed;
	}

	.delete-btn {
		background: transparent;
		border: 1px solid #7f1d1d;
		color: #f87171;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		transition: border-color 0.15s, color 0.15s, background 0.15s;
	}

	.delete-btn:hover:not(:disabled) {
		background: #7f1d1d22;
		border-color: #f87171;
	}

	.delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.enrich-btn {
		background: transparent;
		border: 1px solid #14532d;
		color: #4ade80;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		transition: border-color 0.15s, color 0.15s, background 0.15s;
	}

	.enrich-btn:hover:not(:disabled) {
		background: #14532d22;
		border-color: #4ade80;
	}

	.enrich-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.table-wrap {
		overflow-x: auto;
		border-radius: 10px;
		border: 1px solid #1a1a2e;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	thead th {
		background: #10101a;
		color: #64748b;
		font-weight: 600;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.75rem 1rem;
		text-align: left;
		white-space: nowrap;
	}

	thead th.num {
		text-align: right;
		cursor: pointer;
	}

	thead th.num:hover {
		color: #7c3aed;
	}

	.check-col {
		width: 2.5rem;
		text-align: center !important;
		padding-left: 0.75rem !important;
		padding-right: 0.5rem !important;
	}

	input[type='checkbox'] {
		accent-color: #7c3aed;
		cursor: pointer;
		width: 15px;
		height: 15px;
	}

	tbody tr {
		border-top: 1px solid #1a1a2e;
		cursor: pointer;
		transition: background 0.1s;
	}

	tbody tr:hover {
		background: #13131f;
	}

	tbody tr.row-selected {
		background: #1a1030;
	}

	tbody tr.row-selected:hover {
		background: #1f1238;
	}

	td {
		padding: 0.75rem 1rem;
		vertical-align: middle;
	}

	.name {
		font-weight: 500;
		color: #f1f5f9;
		white-space: nowrap;
	}

	.addr {
		color: #94a3b8;
		max-width: 240px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.maps-link {
		margin-left: 0.4rem;
		font-size: 0.7rem;
		color: #4a90d9;
		text-decoration: none;
		opacity: 0.7;
		transition: opacity 0.15s;
	}

	.maps-link:hover {
		opacity: 1;
		color: #60b4ff;
	}

	.site-link {
		color: #7c3aed;
		font-size: 0.8rem;
	}

	.site-link:hover {
		color: #d946ef;
	}

	.inferred-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #78350f;
		color: #fbbf24;
		font-size: 0.65rem;
		font-weight: 700;
		margin-left: 0.3rem;
		cursor: default;
		vertical-align: middle;
	}

	.email-link {
		color: #64a8a8;
		font-size: 0.78rem;
		text-decoration: none;
	}

	.email-link:hover {
		color: #7ee8e8;
	}

	.none {
		color: #4a5568;
	}

	.num {
		text-align: right;
	}

	.score {
		font-family: 'JetBrains Mono', monospace;
		font-size: 1rem;
		font-weight: 600;
		color: #d946ef;
	}

	.badge {
		display: inline-block;
		padding: 0.2rem 0.55rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
	}

	.badge-high {
		background: #3b0764;
		color: #d946ef;
	}

	.badge-medium {
		background: #1e1b4b;
		color: #818cf8;
	}

	.badge-low {
		background: #1a1a2e;
		color: #64748b;
	}

	.badge-cold {
		background: #1a1a2e;
		color: #64748b;
	}

	.badge-contacted {
		background: #1e2a4a;
		color: #60a5fa;
	}

	.badge-proposal {
		background: #2a1a4e;
		color: #a78bfa;
	}

	.badge-won {
		background: #14291a;
		color: #4ade80;
	}

	.badge-lost {
		background: #2a1a4a;
		color: #f87171;
	}

	.empty {
		text-align: center;
		color: #4a5568;
		padding: 3rem;
	}

	.new-lead-btn {
		background: #7c3aed;
		border: none;
		color: #fff;
		padding: 0.35rem 0.85rem;
		border-radius: 6px;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		font-weight: 600;
		transition: background 0.15s;
	}

	.new-lead-btn:hover {
		background: #6d28d9;
	}

	/* Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 1rem;
	}

	.modal {
		background: #10101a;
		border: 1px solid #2a2a3e;
		border-radius: 12px;
		width: 100%;
		max-width: 560px;
		max-height: 90vh;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.25rem;
	}

	.modal-header h2 {
		font-size: 1.1rem;
		color: #f1f5f9;
		margin: 0;
	}

	.modal-close {
		background: transparent;
		border: none;
		color: #64748b;
		font-size: 1rem;
		cursor: pointer;
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
		transition: color 0.15s;
	}

	.modal-close:hover {
		color: #f1f5f9;
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.85rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.8rem;
		color: #94a3b8;
	}

	.field-full {
		grid-column: 1 / -1;
	}

	.field input,
	.field textarea {
		background: #13131f;
		border: 1px solid #2a2a3e;
		color: #e2e8f0;
		padding: 0.4rem 0.6rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-family: inherit;
		outline: none;
		transition: border-color 0.15s;
	}

	.field input:focus,
	.field textarea:focus {
		border-color: #7c3aed;
	}

	.field textarea {
		resize: vertical;
	}

	.required {
		color: #f87171;
	}

	.form-error {
		margin-top: 0.75rem;
		color: #f87171;
		font-size: 0.82rem;
		background: #2a1a1a;
		border: 1px solid #7f1d1d;
		border-radius: 6px;
		padding: 0.5rem 0.75rem;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 1.25rem;
	}

	.cancel-btn {
		background: transparent;
		border: 1px solid #2a2a3e;
		color: #94a3b8;
		padding: 0.4rem 0.9rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		transition: border-color 0.15s, color 0.15s;
	}

	.cancel-btn:hover {
		border-color: #64748b;
		color: #e2e8f0;
	}

	.submit-btn {
		background: #7c3aed;
		border: none;
		color: #fff;
		padding: 0.4rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 600;
		transition: background 0.15s;
	}

	.submit-btn:hover:not(:disabled) {
		background: #6d28d9;
	}

	.submit-btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.enrich-progress {
		margin-bottom: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.progress-track {
		width: 100%;
		height: 4px;
		background: #2a2a3e;
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #4ade80, #22c55e);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.progress-lead-name {
		font-size: 0.72rem;
		color: #64748b;
		font-style: italic;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 400px;
	}
</style>
