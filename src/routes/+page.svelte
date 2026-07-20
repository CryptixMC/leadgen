<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import type { Lead } from '$lib/api';
	import { batchDeleteLeads, batchHideLeads, createLead, enrichLead, geocodeMissing } from '$lib/api';
	import LeadsTable from '$lib/components/LeadsTable.svelte';
	import LeadsKanban from '$lib/components/LeadsKanban.svelte';
	import LeadsMap from '$lib/components/LeadsMap.svelte';

	let { data }: { data: PageData } = $props();

	let leads = $state<Lead[]>(data.leads);
	$effect(() => {
		leads = data.leads;
	});

	type ViewMode = 'list' | 'kanban' | 'map';
	const VALID_VIEWS: ViewMode[] = ['list', 'kanban', 'map'];
	const view = $derived(
		(VALID_VIEWS.includes($page.url.searchParams.get('view') as ViewMode)
			? ($page.url.searchParams.get('view') as ViewMode)
			: 'list')
	);

	function setView(v: ViewMode) {
		goto(`?view=${v}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	let statusFilter = $state('');
	let priorityFilter = $state('');
	let categoryFilter = $state('');
	let searchQuery = $state('');

	type SortColumn =
		| 'business_name'
		| 'category'
		| 'address'
		| 'website_url'
		| 'email'
		| 'lead_score'
		| 'priority'
		| 'status';
	let sortColumn = $state<SortColumn>('lead_score');
	let sortDir = $state<'asc' | 'desc'>('desc');
	let selected = $state(new Set<string>());
	let deleting = $state(false);
	let hiding = $state(false);
	let enriching = $state(false);
	let enrichMode = $state<'quick' | 'deep'>('quick');
	let enrichProgress = $state({ done: 0, total: 0 });
	let enrichCurrentName = $state('');
	let scanningId = $state<string | null>(null);

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
	const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
	const STATUS_RANK: Record<string, number> = {
		cold: 0,
		contacted: 1,
		proposal: 2,
		closed_won: 3,
		closed_lost: 4
	};

	const CATEGORIES = $derived(
		Array.from(
			new Set(leads.map((l) => l.category).filter((c): c is string => Boolean(c)))
		).sort()
	);

	function matchesSearch(l: Lead, q: string): boolean {
		if (!q.trim()) return true;
		const needle = q.toLowerCase();
		return Boolean(
			l.business_name?.toLowerCase().includes(needle) ||
			l.address?.toLowerCase().includes(needle) ||
			l.phone?.toLowerCase().includes(needle) ||
			l.email?.toLowerCase().includes(needle) ||
			l.website_url?.toLowerCase().includes(needle)
		);
	}

	function presenceThenAlpha(a: string | null, b: string | null): number {
		const aHas = Boolean(a);
		const bHas = Boolean(b);
		if (aHas !== bHas) return aHas ? -1 : 1;
		if (!aHas) return 0;
		return a!.localeCompare(b!);
	}

	function compareLeads(a: Lead, b: Lead, column: SortColumn, dir: 'asc' | 'desc'): number {
		let cmp: number;
		switch (column) {
			case 'business_name':
				cmp = (a.business_name ?? '').localeCompare(b.business_name ?? '');
				break;
			case 'category':
				cmp = (a.category ?? '').localeCompare(b.category ?? '');
				break;
			case 'address':
				cmp = (a.address ?? '').localeCompare(b.address ?? '');
				break;
			case 'website_url':
				cmp = presenceThenAlpha(a.website_url, b.website_url);
				break;
			case 'email':
				cmp = presenceThenAlpha(a.email, b.email);
				break;
			case 'lead_score':
				cmp = (a.lead_score ?? 0) - (b.lead_score ?? 0);
				break;
			case 'priority':
				cmp = (PRIORITY_RANK[a.priority ?? ''] ?? 0) - (PRIORITY_RANK[b.priority ?? ''] ?? 0);
				break;
			case 'status':
				cmp = (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0);
				break;
		}
		return dir === 'asc' ? cmp : -cmp;
	}

	function toggleSort(column: SortColumn) {
		if (sortColumn === column) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortColumn = column;
			sortDir = column === 'lead_score' ? 'desc' : 'asc';
		}
	}

	const filtered = $derived(
		leads
			.filter((l) => (statusFilter ? l.status === statusFilter : true))
			.filter((l) => (priorityFilter ? l.priority === priorityFilter : true))
			.filter((l) => (categoryFilter ? l.category === categoryFilter : true))
			.filter((l) => matchesSearch(l, searchQuery))
			.sort((a, b) => compareLeads(a, b, sortColumn, sortDir))
	);

	const kanbanFiltered = $derived(
		leads
			.filter((l) => (priorityFilter ? l.priority === priorityFilter : true))
			.filter((l) => (categoryFilter ? l.category === categoryFilter : true))
			.filter((l) => matchesSearch(l, searchQuery))
	);

	const allFilteredSelected = $derived(
		filtered.length > 0 && filtered.every((l) => selected.has(l.id))
	);

	function toggleSelect(id: string, e?: Event) {
		e?.stopPropagation();
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

	function selectMany(ids: string[]) {
		const next = new Set(selected);
		ids.forEach((id) => next.add(id));
		selected = next;
	}

	function selectNonEnriched() {
		const next = new Set(selected);
		filtered.filter((l) => l.lead_score === null).forEach((l) => next.add(l.id));
		selected = next;
	}

	async function enrichSelected(deep: boolean) {
		if (selected.size === 0) return;
		enriching = true;
		enrichMode = deep ? 'deep' : 'quick';
		const ids = [...selected];
		enrichProgress = { done: 0, total: ids.length };
		try {
			for (const id of ids) {
				const lead = leads.find((l) => l.id === id);
				enrichCurrentName = lead?.business_name ?? '';
				await enrichLead(id, { deep });
				enrichProgress = { ...enrichProgress, done: enrichProgress.done + 1 };
			}
			enrichCurrentName = '';
			selected = new Set();
			await invalidateAll();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Scan failed');
		} finally {
			enriching = false;
			enrichMode = 'quick';
			enrichProgress = { done: 0, total: 0 };
			enrichCurrentName = '';
		}
	}

	async function scanSingleLead(id: string, deep: boolean, e: Event) {
		e.stopPropagation();
		scanningId = id;
		try {
			await enrichLead(id, { deep });
			await invalidateAll();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Scan failed');
		} finally {
			scanningId = null;
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

	function handleKanbanStatusChange(id: string, status: string) {
		leads = leads.map((l) => (l.id === id ? { ...l, status } : l));
	}

	async function handleGeocodeMissing() {
		const result = await geocodeMissing();
		await invalidateAll();
		return result;
	}
</script>

<svelte:head>
	<title>LeadGen — Leads</title>
</svelte:head>

<div class="leads-page" class:map-active={view === 'map'}>
	<div class="page-shell">
		<div class="header">
			<h1>Leads</h1>
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
					<span>View</span>
					<select value={view} onchange={(e) => setView((e.currentTarget as HTMLSelectElement).value as ViewMode)}>
						<option value="list">List</option>
						<option value="kanban">Kanban</option>
						<option value="map">Map</option>
					</select>
				</label>
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
				<label>
					<span>Category</span>
					<select bind:value={categoryFilter}>
						<option value="">All</option>
						{#each CATEGORIES as c}
							<option value={c}>{c}</option>
						{/each}
					</select>
				</label>
			</div>
			<div class="right-controls">
				{#if selected.size > 0}
					<button class="quick-scan-btn" onclick={() => enrichSelected(false)} disabled={enriching || deleting || hiding}>
						{enriching && enrichMode === 'quick'
							? `Quick scanning ${enrichProgress.done}/${enrichProgress.total}…`
							: `Quick Scan ${selected.size}`}
					</button>
					<button class="deep-scan-btn" onclick={() => enrichSelected(true)} disabled={enriching || deleting || hiding}>
						{enriching && enrichMode === 'deep'
							? `Deep scanning ${enrichProgress.done}/${enrichProgress.total}…`
							: `Deep Scan ${selected.size}`}
					</button>
					<button class="hide-btn" onclick={hideSelected} disabled={hiding || deleting || enriching}>
						{hiding ? 'Hiding…' : `Hide ${selected.size} selected`}
					</button>
					<button class="delete-btn" onclick={deleteSelected} disabled={deleting || enriching || hiding}>
						{deleting ? 'Deleting…' : `Delete ${selected.size} selected`}
					</button>
				{/if}
				<button class="select-all-btn" onclick={toggleSelectAll}>
					{allFilteredSelected ? 'Deselect all' : 'Select all'}
				</button>
				<button class="select-unenriched-btn" onclick={selectNonEnriched}>
					Select unenriched
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
					<div class="progress-lead-name">{enrichMode === 'deep' ? 'Deep scanning' : 'Quick scanning'}: {enrichCurrentName}</div>
				{/if}
			</div>
		{/if}
	</div>

	{#if view === 'map'}
		<div class="map-fill">
			<LeadsMap
				{leads}
				{statusFilter}
				{priorityFilter}
				{categoryFilter}
				{searchQuery}
				{selected}
				onToggleSelect={(id) => toggleSelect(id)}
				onSelectMany={selectMany}
				onGeocodeMissing={handleGeocodeMissing}
			/>
		</div>
	{:else}
		<div class="content-shell">
			{#if view === 'kanban'}
				<LeadsKanban
					leads={kanbanFiltered}
					{selected}
					onToggleSelect={(id, e) => toggleSelect(id, e)}
					onStatusChange={handleKanbanStatusChange}
				/>
			{:else}
				<LeadsTable
					leads={filtered}
					{selected}
					{scanningId}
					{enriching}
					{sortColumn}
					{sortDir}
					allSelected={allFilteredSelected}
					onToggleSort={toggleSort}
					onToggleSelect={(id, e) => toggleSelect(id, e)}
					onToggleSelectAll={toggleSelectAll}
					onScanLead={scanSingleLead}
				/>
			{/if}
		</div>
	{/if}
</div>

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
						<input type="text" bind:value={createForm.website_url} placeholder="https://example.com" />
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
	.leads-page {
		display: flex;
		flex-direction: column;
	}

	.leads-page.map-active {
		height: calc(100vh - 60px);
	}

	.leads-page.map-active .page-shell {
		max-width: none;
	}

	.page-shell {
		padding: 2rem 2rem 0;
		max-width: 1400px;
		width: 100%;
		box-sizing: border-box;
		margin: 0 auto;
	}

	.content-shell {
		padding: 0 2rem 2rem;
		max-width: 1400px;
		width: 100%;
		box-sizing: border-box;
		margin: 0 auto;
	}

	.map-fill {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
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

	.select-all-btn,
	.select-unenriched-btn {
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

	.select-all-btn:hover,
	.select-unenriched-btn:hover {
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

	.quick-scan-btn {
		background: transparent;
		border: 1px solid rgba(45, 198, 83, 0.3);
		color: #2DC653;
		padding: 0.38rem 0.85rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-size: 0.8rem;
		transition: border-color var(--dur-fast), background var(--dur-fast);
	}

	.quick-scan-btn:hover:not(:disabled) {
		background: rgba(45, 198, 83, 0.08);
		border-color: #2DC653;
	}

	.quick-scan-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.deep-scan-btn {
		background: transparent;
		border: 1px solid rgba(124, 58, 237, 0.35);
		color: #a78bfa;
		padding: 0.38rem 0.85rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-size: 0.8rem;
		transition: border-color var(--dur-fast), background var(--dur-fast);
	}

	.deep-scan-btn:hover:not(:disabled) {
		background: rgba(124, 58, 237, 0.1);
		border-color: #a78bfa;
	}

	.deep-scan-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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

	/* Responsive breakpoints */
	@media (max-width: 768px) {
		.page-shell {
			padding: 1rem 1rem 0;
		}

		.content-shell {
			padding: 0 1rem 1rem;
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
			flex: 1 1 calc(50% - 0.375rem);
			min-width: 110px;
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
