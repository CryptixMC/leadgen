<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Lead } from '$lib/api';
	import { batchDeleteLeads, batchHideLeads, createLead, enrichLead } from '$lib/api';

	let { data }: { data: PageData } = $props();

	let statusFilter = $state('');
	let priorityFilter = $state('');
	let searchQuery = $state('');
	let sortAsc = $state(false);
	let selected = $state(new Set<string>());
	let deleting = $state(false);
	let hiding = $state(false);
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
				google_rating: Number(createForm.google_rating) || 0,
				review_count: Number(createForm.review_count) || 0
			};
			if (createForm.address.trim()) payload.address = createForm.address.trim();
			if (createForm.phone.trim()) payload.phone = createForm.phone.trim();
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
			.filter((l) => {
				if (!searchQuery.trim()) return true;
				const q = searchQuery.toLowerCase();
				return (
					l.business_name?.toLowerCase().includes(q) ||
					l.address?.toLowerCase().includes(q) ||
					l.phone?.toLowerCase().includes(q) ||
					l.email?.toLowerCase().includes(q) ||
					l.website_url?.toLowerCase().includes(q)
				);
			})
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

	function selectNonEnriched() {
		const next = new Set(selected);
		filtered.filter((l) => l.lead_score === null).forEach((l) => next.add(l.id));
		selected = next;
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

	async function hideSelected() {
		if (selected.size === 0) return;
		if (!confirm(`Hide ${selected.size} lead${selected.size === 1 ? '' : 's'}? They won't appear in the dashboard and the scraper will skip them.`)) return;
		hiding = true;
		try {
			await batchHideLeads([...selected]);
			selected = new Set();
			await invalidateAll();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Hide failed');
		} finally {
			hiding = false;
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
		<div class="search-wrap">
			<span class="search-icon">⌕</span>
			<input
				class="search-input"
				type="text"
				bind:value={searchQuery}
				placeholder="Search leads…"
				autocomplete="off"
			/>
			{#if searchQuery}
				<button class="search-clear" onclick={() => (searchQuery = '')} aria-label="Clear search">✕</button>
			{/if}
		</div>
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
				<button class="enrich-btn" onclick={enrichSelected} disabled={enriching || deleting || hiding}>
					{enriching
						? `Enriching ${enrichProgress.done}/${enrichProgress.total}…`
						: `Enrich ${selected.size} selected`}
				</button>
				<button class="hide-btn" onclick={hideSelected} disabled={hiding || deleting || enriching}>
					{hiding ? 'Hiding…' : `Hide ${selected.size} selected`}
				</button>
				<button class="delete-btn" onclick={deleteSelected} disabled={deleting || enriching || hiding}>
					{deleting ? 'Deleting…' : `Delete ${selected.size} selected`}
				</button>
			{/if}
<<<<<<< HEAD
			<button class="select-unenriched-btn" onclick={selectNonEnriched}>
				Select unenriched
			</button>
=======
			<button class="select-unenriched-btn" onclick={selectNonEnriched}>Select unenriched</button>
>>>>>>> fa42215 (Fix 'Select unenriched' button to select leads with null lead_score)
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

	<!-- Mobile card list (shown only on small screens) -->
	<div class="card-list">
		{#each filtered as lead (lead.id)}
			<div
				class="lead-card"
				class:card-selected={selected.has(lead.id)}
				onclick={() => (window.location.href = `/leads/${lead.id}`)}
				role="button"
				tabindex="0"
				onkeydown={(e) => e.key === 'Enter' && (window.location.href = `/leads/${lead.id}`)}
			>
				<div class="card-check">
					<input type="checkbox" checked={selected.has(lead.id)} onclick={(e) => { e.stopPropagation(); toggleSelect(lead.id, e); }} />
				</div>
				<div class="card-body">
					<div class="card-top">
						<span class="card-name">{lead.business_name}</span>
						<span class="card-score" style="color: {lead.lead_score !== null && lead.lead_score >= 60 ? 'var(--accent-highlight)' : lead.lead_score !== null && lead.lead_score >= 30 ? '#818cf8' : 'var(--text-muted)'}">{lead.lead_score ?? '—'}</span>
					</div>
					<div class="card-badges">
						<span class={priorityClass(lead.priority)}>{lead.priority ?? '—'}</span>
						<span class={statusClass(lead.status)}>{lead.status}</span>
						<a
							href={`https://www.google.com/maps/place/?q=place_id:${lead.google_place_id}`}
							target="_blank"
							rel="noopener noreferrer"
							onclick={(e) => e.stopPropagation()}
							class="maps-link"
						>Maps</a>
					</div>
					{#if lead.address}
						<div class="card-addr">{lead.address}</div>
					{/if}
					{#if lead.website_url}
						<div class="card-meta">
							<a
								href={lead.website_url}
								target="_blank"
								rel="noopener noreferrer"
								onclick={(e) => e.stopPropagation()}
								class="site-link"
							>{new URL(lead.website_url).hostname}</a>
							{#if lead.website_inferred}
								<span class="inferred-badge" title="Found via web search">!</span>
							{/if}
						</div>
					{:else if lead.email}
						<div class="card-meta">
							<a href={`mailto:${lead.email}`} onclick={(e) => e.stopPropagation()} class="email-link">{lead.email}</a>
						</div>
					{/if}
				</div>
			</div>
		{/each}
		{#if filtered.length === 0}
			<div class="empty card-empty">No leads match your filters.</div>
		{/if}
	</div>
</main>

{#if showCreateModal}
	<div class="modal-backdrop" onclick={closeCreateModal} role="dialog" aria-modal="true">
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<div class="modal-title-group">
					<h2>New Lead</h2>
					<span class="modal-subtitle">Only Business Name is required</span>
				</div>
				<button class="modal-close" onclick={closeCreateModal} aria-label="Close">✕</button>
			</div>
			<form onsubmit={handleCreateLead}>
				<div class="form-grid">
					<label class="field field-full">
						<span>Business Name <span class="required">*</span></span>
						<input type="text" bind:value={createForm.business_name} required placeholder="Acme Plumbing Co." />
					</label>

					<label class="field">
						<span>Phone <span class="optional-hint">optional</span></span>
						<input type="text" bind:value={createForm.phone} placeholder="(204) 555-0100" />
					</label>
					<label class="field">
						<span>Email <span class="optional-hint">optional</span></span>
						<input type="email" bind:value={createForm.email} placeholder="owner@example.com" />
					</label>

					<label class="field field-full">
						<span>Address <span class="optional-hint">optional</span></span>
						<input type="text" bind:value={createForm.address} placeholder="123 Main St, Winnipeg, MB" />
					</label>

					<label class="field field-full">
						<span>Website URL <span class="optional-hint">optional</span></span>
						<input type="url" bind:value={createForm.website_url} placeholder="https://example.com" />
					</label>

					<label class="field">
						<span>Google Rating <span class="optional-hint">optional</span></span>
						<input type="number" bind:value={createForm.google_rating} min="0" max="5" step="0.1" placeholder="4.2" />
					</label>
					<label class="field">
						<span>Review Count <span class="optional-hint">optional</span></span>
						<input type="number" bind:value={createForm.review_count} min="0" placeholder="47" />
					</label>

					<label class="field field-full">
						<span>Notes <span class="optional-hint">optional</span></span>
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
		color: var(--text-primary);
	}

	.count {
		color: var(--text-muted);
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
		color: var(--text-muted);
		font-family: var(--font-ui);
	}

	select {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		color: var(--text-primary);
		padding: 0.42rem 0.7rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
		outline: none;
		font-family: var(--font-body);
		transition: border-color var(--dur-fast);
	}

	select:focus {
		border-color: var(--accent-primary);
	}

	.right-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: auto;
	}

	.select-unenriched-btn {
		background: transparent;
<<<<<<< HEAD
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
		padding: 0.38rem 0.85rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-family: var(--font-display);
		font-size: 0.8rem;
		transition: border-color var(--dur-fast), color var(--dur-fast);
	}

	.select-unenriched-btn:hover {
		border-color: var(--accent-primary);
		color: var(--text-primary);
=======
		border: 1px solid #2a2a3e;
		color: #94a3b8;
		padding: 0.35rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		transition: border-color 0.15s, color 0.15s;
	}

	.select-unenriched-btn:hover {
		border-color: #7c3aed;
		color: #7c3aed;
>>>>>>> fa42215 (Fix 'Select unenriched' button to select leads with null lead_score)
	}

	.sort-btn {
		background: transparent;
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
		padding: 0.38rem 0.85rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-family: var(--font-display);
		font-size: 0.8rem;
		transition: border-color var(--dur-fast), color var(--dur-fast);
	}

	.sort-btn:hover {
		border-color: var(--accent-primary);
		color: var(--text-primary);
	}

	.delete-btn {
		background: transparent;
		border: 1px solid rgba(248, 113, 113, 0.3);
		color: #f87171;
		padding: 0.38rem 0.85rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-size: 0.8rem;
		transition: border-color var(--dur-fast), background var(--dur-fast);
	}

	.delete-btn:hover:not(:disabled) {
		background: rgba(248, 113, 113, 0.08);
		border-color: #f87171;
	}

	.delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.hide-btn {
		background: transparent;
		border: 1px solid rgba(251, 191, 36, 0.3);
		color: #fbbf24;
		padding: 0.38rem 0.85rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-size: 0.8rem;
		transition: border-color var(--dur-fast), background var(--dur-fast);
	}

	.hide-btn:hover:not(:disabled) {
		background: rgba(251, 191, 36, 0.08);
		border-color: #fbbf24;
	}

	.hide-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.enrich-btn {
		background: transparent;
		border: 1px solid rgba(45, 198, 83, 0.3);
		color: #2DC653;
		padding: 0.38rem 0.85rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-size: 0.8rem;
		transition: border-color var(--dur-fast), background var(--dur-fast);
	}

	.enrich-btn:hover:not(:disabled) {
		background: rgba(45, 198, 83, 0.08);
		border-color: #2DC653;
	}

	.enrich-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.table-wrap {
		overflow-x: auto;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-subtle);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	thead th {
		background: rgba(17, 17, 24, 0.9);
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-weight: 600;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		padding: 0.9rem 1rem;
		text-align: left;
		white-space: nowrap;
		border-bottom: 1px solid var(--border-grid);
	}

	thead th.num {
		text-align: right;
		cursor: pointer;
	}

	thead th.num:hover {
		color: var(--accent-primary);
	}

	.check-col {
		width: 2.5rem;
		text-align: center !important;
		padding-left: 0.75rem !important;
		padding-right: 0.5rem !important;
	}

	input[type='checkbox'] {
		accent-color: var(--accent-primary);
		cursor: pointer;
		width: 14px;
		height: 14px;
	}

	tbody tr {
		border-top: 1px solid var(--border-grid);
		cursor: pointer;
		transition: background var(--dur-fast);
	}

	tbody tr:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	tbody tr.row-selected {
		background: rgba(107, 33, 168, 0.12);
	}

	tbody tr.row-selected:hover {
		background: rgba(107, 33, 168, 0.18);
	}

	td {
		padding: 0.75rem 1rem;
		vertical-align: middle;
	}

	.name {
		font-weight: 500;
		color: var(--text-primary);
		white-space: nowrap;
	}

	.addr {
		color: var(--text-muted);
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
		transition: opacity var(--dur-fast);
	}

	.maps-link:hover {
		opacity: 1;
		color: #60b4ff;
	}

	.site-link {
		color: var(--accent-primary);
		font-size: 0.8rem;
	}

	.site-link:hover {
		color: var(--accent-highlight);
	}

	.inferred-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: rgba(251, 191, 36, 0.2);
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
		color: var(--text-muted);
		opacity: 0.5;
	}

	.num {
		text-align: right;
	}

	.score {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 600;
		color: var(--accent-highlight);
	}

	.badge {
		display: inline-block;
		padding: 0.18rem 0.55rem;
		border-radius: var(--radius-pill);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		white-space: nowrap;
	}

	/* Priority badges */
	.badge-high {
		background: rgba(107, 33, 168, 0.3);
		border: 1px solid rgba(217, 70, 239, 0.5);
		color: #F0ABFC;
	}

	.badge-medium {
		background: rgba(124, 58, 237, 0.15);
		border: 1px solid rgba(124, 58, 237, 0.35);
		color: #a78bfa;
	}

	.badge-low {
		background: rgba(144, 144, 176, 0.08);
		border: 1px solid rgba(144, 144, 176, 0.2);
		color: var(--text-muted);
	}

	/* Status badges */
	.badge-cold {
		background: rgba(144, 144, 176, 0.08);
		border: 1px solid rgba(144, 144, 176, 0.15);
		color: var(--text-muted);
	}

	.badge-contacted {
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid rgba(96, 165, 250, 0.25);
		color: #60a5fa;
	}

	.badge-proposal {
		background: rgba(124, 58, 237, 0.12);
		border: 1px solid rgba(124, 58, 237, 0.3);
		color: #a78bfa;
	}

	.badge-won {
		background: rgba(45, 198, 83, 0.1);
		border: 1px solid rgba(45, 198, 83, 0.3);
		color: #2DC653;
	}

	.badge-lost {
		background: rgba(248, 113, 113, 0.08);
		border: 1px solid rgba(248, 113, 113, 0.2);
		color: #f87171;
	}

	.empty {
		text-align: center;
		color: var(--text-muted);
		opacity: 0.6;
		padding: 3rem;
	}

	.new-lead-btn {
		background: var(--gradient-primary);
		border: none;
		color: var(--bg-base);
		padding: 0.42rem 1.1rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-family: var(--font-body);
		font-size: 0.85rem;
		font-weight: 600;
		transition: box-shadow var(--dur-fast), transform var(--dur-fast);
	}

	.new-lead-btn:hover {
		box-shadow: var(--glow-cta);
		transform: translateY(-1px);
	}

	/* Search */
	.search-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: 0.7rem;
		color: var(--text-muted);
		font-size: 1rem;
		pointer-events: none;
		line-height: 1;
	}

	.search-input {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		color: var(--text-primary);
		padding: 0.42rem 1.8rem 0.42rem 2rem;
		border-radius: var(--radius-sm);
		font-size: 0.85rem;
		font-family: var(--font-body);
		outline: none;
		width: 210px;
		transition: border-color var(--dur-fast), width var(--dur-base);
	}

	.search-input:focus {
		border-color: var(--accent-primary);
		width: 270px;
	}

	.search-input::placeholder {
		color: var(--text-muted);
		opacity: 0.6;
	}

	.search-clear {
		position: absolute;
		right: 0.45rem;
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 0.7rem;
		padding: 0.15rem 0.25rem;
		border-radius: 3px;
		line-height: 1;
		transition: color var(--dur-fast);
	}

	.search-clear:hover {
		color: var(--text-primary);
	}

	/* Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.72);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
		padding: 1rem;
	}

	.modal {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-top: 2px solid var(--accent-primary);
		border-radius: var(--radius-lg);
		width: 100%;
		max-width: 640px;
		max-height: 90vh;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.modal-title-group {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.modal-header h2 {
		font-size: 1.1rem;
		color: var(--text-primary);
		margin: 0;
	}

	.modal-subtitle {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-family: var(--font-ui);
	}

	.optional-hint {
		font-size: 0.7rem;
		font-weight: 400;
		color: var(--text-muted);
		opacity: 0.6;
		margin-left: 0.2rem;
		font-family: var(--font-body);
	}

	.modal-close {
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: 1rem;
		cursor: pointer;
		padding: 0.2rem 0.4rem;
		border-radius: var(--radius-sm);
		transition: color var(--dur-fast);
	}

	.modal-close:hover {
		color: var(--text-primary);
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.78rem;
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.field-full {
		grid-column: 1 / -1;
	}

	.field input,
	.field textarea {
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		color: var(--text-primary);
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		font-family: var(--font-body);
		font-weight: 400;
		text-transform: none;
		letter-spacing: 0;
		outline: none;
		transition: border-color var(--dur-fast);
		width: 100%;
		box-sizing: border-box;
	}

	.field input:focus,
	.field textarea:focus {
		border-color: var(--accent-primary);
	}

	.field input::placeholder,
	.field textarea::placeholder {
		color: var(--text-muted);
		opacity: 0.5;
	}

	.field textarea {
		resize: vertical;
	}

	.required {
		color: #f87171;
		font-family: var(--font-body);
		text-transform: none;
		letter-spacing: 0;
	}

	.form-error {
		margin-top: 0.75rem;
		color: #f87171;
		font-size: 0.82rem;
		background: rgba(248, 113, 113, 0.08);
		border: 1px solid rgba(248, 113, 113, 0.2);
		border-radius: var(--radius-sm);
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
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
		padding: 0.42rem 1rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-size: 0.85rem;
		transition: border-color var(--dur-fast), color var(--dur-fast);
	}

	.cancel-btn:hover {
		border-color: var(--border-strong);
		color: var(--text-primary);
	}

	.submit-btn {
		background: var(--gradient-primary);
		border: none;
		color: var(--bg-base);
		padding: 0.42rem 1.1rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 600;
		transition: box-shadow var(--dur-fast), transform var(--dur-fast);
	}

	.submit-btn:hover:not(:disabled) {
		box-shadow: var(--glow-cta);
		transform: translateY(-1px);
	}

	.submit-btn:disabled {
		opacity: 0.5;
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
		background: var(--border-subtle);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--gradient-primary);
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.progress-lead-name {
		font-size: 0.72rem;
		color: var(--text-muted);
		font-style: italic;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 400px;
	}

	/* Mobile card list */
	.card-list {
		display: none;
		flex-direction: column;
		gap: 0.5rem;
	}

	.lead-card {
		background: var(--bg-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: 0.75rem;
		display: flex;
		gap: 0.5rem;
		cursor: pointer;
		transition: background var(--dur-fast), border-color var(--dur-fast);
		-webkit-tap-highlight-color: transparent;
	}

	.lead-card:hover,
	.lead-card:focus {
		background: rgba(255, 255, 255, 0.04);
		border-color: var(--border-strong);
		outline: none;
	}

	.lead-card.card-selected {
		background: rgba(107, 33, 168, 0.12);
		border-color: rgba(124, 58, 237, 0.35);
	}

	.card-check {
		display: flex;
		align-items: flex-start;
		padding-top: 0.1rem;
		flex-shrink: 0;
	}

	.card-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.card-top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}

	.card-name {
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-score {
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.card-badges {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.card-addr {
		font-size: 0.78rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-meta {
		font-size: 0.78rem;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.card-empty {
		text-align: center;
		color: var(--text-muted);
		opacity: 0.6;
		padding: 3rem 1rem;
		background: var(--bg-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
	}

	/* Responsive breakpoints */
	@media (max-width: 768px) {
		main {
			padding: 1rem;
		}

		.controls {
			flex-direction: column;
			align-items: stretch;
		}

		.search-wrap {
			width: 100%;
		}

		.search-input {
			width: 100% !important;
			transition: border-color var(--dur-fast);
		}

		.search-input:focus {
			width: 100% !important;
		}

		.filters {
			width: 100%;
		}

		.filters label {
			flex: 1;
		}

		.filters select {
			width: 100%;
		}

		.right-controls {
			margin-left: 0;
			flex-wrap: wrap;
		}

		.right-controls button {
			flex: 1;
			min-height: 44px;
			justify-content: center;
		}

		.table-wrap {
			display: none;
		}

		.card-list {
			display: flex;
		}
	}

	@media (max-width: 640px) {
		.form-grid {
			grid-template-columns: 1fr;
		}

		.field-full {
			grid-column: 1;
		}
	}
</style>
