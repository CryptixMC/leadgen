<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Lead } from '$lib/api';
	import { batchDeleteLeads } from '$lib/api';
	import { supabase } from '$lib/supabase.js';

	let { data }: { data: PageData } = $props();

	let statusFilter = $state('');
	let priorityFilter = $state('');
	let sortAsc = $state(false);
	let selected = $state(new Set<string>());
	let deleting = $state(false);

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

	async function deleteSelected() {
		if (selected.size === 0) return;
		if (!confirm(`Delete ${selected.size} lead${selected.size === 1 ? '' : 's'}? This cannot be undone.`)) return;
		deleting = true;
		try {
			const { data: { session } } = await supabase.auth.getSession();
			await batchDeleteLeads([...selected], session?.access_token);
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
				<button class="delete-btn" onclick={deleteSelected} disabled={deleting}>
					{deleting ? 'Deleting…' : `Delete ${selected.size} selected`}
				</button>
			{/if}
			<button class="sort-btn" onclick={() => (sortAsc = !sortAsc)}>
				Score {sortAsc ? '↑' : '↓'}
			</button>
		</div>
	</div>

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
						<td class="name">{lead.business_name}</td>
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
						<td colspan="7" class="empty">No leads match your filters.</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</main>

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

	.site-link {
		color: #7c3aed;
		font-size: 0.8rem;
	}

	.site-link:hover {
		color: #d946ef;
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
</style>
