<script lang="ts">
	import type { PageData } from './$types';
	import type { Lead } from '$lib/api';

	let { data }: { data: PageData } = $props();

	let statusFilter = $state('');
	let priorityFilter = $state('');
	let sortAsc = $state(false);

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
		<button class="sort-btn" onclick={() => (sortAsc = !sortAsc)}>
			Score {sortAsc ? '↑' : '↓'}
		</button>
	</div>

	<div class="table-wrap">
		<table>
			<thead>
				<tr>
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
					<tr onclick={() => (window.location.href = `/leads/${lead.id}`)}>
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
						<td colspan="6" class="empty">No leads match your filters.</td>
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

	.sort-btn {
		margin-left: auto;
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

	tbody tr {
		border-top: 1px solid #1a1a2e;
		cursor: pointer;
		transition: background 0.1s;
	}

	tbody tr:hover {
		background: #13131f;
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
		background: #2a1a1a;
		color: #f87171;
	}

	.empty {
		text-align: center;
		color: #4a5568;
		padding: 3rem;
	}
</style>
