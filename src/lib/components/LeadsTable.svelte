<script lang="ts">
	import type { Lead } from '$lib/api';

	type SortColumn =
		| 'business_name'
		| 'category'
		| 'address'
		| 'website_url'
		| 'email'
		| 'lead_score'
		| 'priority'
		| 'status';

	let {
		leads,
		selected,
		scanningId,
		enriching,
		sortColumn,
		sortDir,
		allSelected,
		onToggleSort,
		onToggleSelect,
		onToggleSelectAll,
		onScanLead
	}: {
		leads: Lead[];
		selected: Set<string>;
		scanningId: string | null;
		enriching: boolean;
		sortColumn: SortColumn;
		sortDir: 'asc' | 'desc';
		allSelected: boolean;
		onToggleSort: (column: SortColumn) => void;
		onToggleSelect: (id: string, e: Event) => void;
		onToggleSelectAll: (e: Event) => void;
		onScanLead: (id: string, deep: boolean, e: Event) => void;
	} = $props();

	function sortIndicator(column: SortColumn): string {
		if (sortColumn !== column) return '';
		return sortDir === 'asc' ? ' ↑' : ' ↓';
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

<div class="table-wrap">
	<table>
		<thead>
			<tr>
				<th class="check-col">
					<input
						type="checkbox"
						checked={allSelected}
						indeterminate={selected.size > 0 && !allSelected}
						onclick={onToggleSelectAll}
					/>
				</th>
				<th class="sortable" onclick={() => onToggleSort('business_name')}>Business{sortIndicator('business_name')}</th>
				<th class="sortable" onclick={() => onToggleSort('category')}>Category{sortIndicator('category')}</th>
				<th class="sortable" onclick={() => onToggleSort('address')}>Address{sortIndicator('address')}</th>
				<th class="sortable" onclick={() => onToggleSort('website_url')}>Website{sortIndicator('website_url')}</th>
				<th class="sortable" onclick={() => onToggleSort('email')}>Email{sortIndicator('email')}</th>
				<th class="sortable num" onclick={() => onToggleSort('lead_score')}>Score{sortIndicator('lead_score')}</th>
				<th class="sortable" onclick={() => onToggleSort('priority')}>Priority{sortIndicator('priority')}</th>
				<th class="sortable" onclick={() => onToggleSort('status')}>Status{sortIndicator('status')}</th>
				<th class="actions-col">Scan</th>
			</tr>
		</thead>
		<tbody>
			{#each leads as lead (lead.id)}
				<tr
					onclick={() => (window.location.href = `/leads/${lead.id}`)}
					class:row-selected={selected.has(lead.id)}
				>
					<td class="check-col">
						<input type="checkbox" checked={selected.has(lead.id)} onclick={(e) => onToggleSelect(lead.id, e)} />
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
					<td class="category-cell">{lead.category ?? '—'}</td>
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
					<td class="actions-col" onclick={(e) => e.stopPropagation()}>
						<div class="row-actions">
							<button
								class="row-scan-btn quick"
								onclick={(e) => onScanLead(lead.id, false, e)}
								disabled={scanningId === lead.id || enriching}
								title="Quick scan this lead"
							>{scanningId === lead.id ? '…' : 'Quick'}</button>
							<button
								class="row-scan-btn deep"
								onclick={(e) => onScanLead(lead.id, true, e)}
								disabled={scanningId === lead.id || enriching}
								title="Deep scan this lead (includes PageSpeed)"
							>{scanningId === lead.id ? '…' : 'Deep'}</button>
						</div>
					</td>
				</tr>
			{/each}
			{#if leads.length === 0}
				<tr>
					<td colspan="10" class="empty">No leads match your filters.</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>

<!-- Mobile sort header (shown only on small screens, alongside the card list) -->
<div class="mobile-sort-header">
	<button class="mobile-sort-th" onclick={() => onToggleSort('business_name')}>Business{sortIndicator('business_name')}</button>
	<button class="mobile-sort-th" onclick={() => onToggleSort('category')}>Category{sortIndicator('category')}</button>
	<button class="mobile-sort-th" onclick={() => onToggleSort('address')}>Address{sortIndicator('address')}</button>
	<button class="mobile-sort-th" onclick={() => onToggleSort('website_url')}>Website{sortIndicator('website_url')}</button>
	<button class="mobile-sort-th" onclick={() => onToggleSort('email')}>Email{sortIndicator('email')}</button>
	<button class="mobile-sort-th" onclick={() => onToggleSort('lead_score')}>Score{sortIndicator('lead_score')}</button>
	<button class="mobile-sort-th" onclick={() => onToggleSort('priority')}>Priority{sortIndicator('priority')}</button>
	<button class="mobile-sort-th" onclick={() => onToggleSort('status')}>Status{sortIndicator('status')}</button>
</div>

<!-- Mobile card list (shown only on small screens) -->
<div class="card-list">
	{#each leads as lead (lead.id)}
		<div
			class="lead-card"
			class:card-selected={selected.has(lead.id)}
			onclick={() => (window.location.href = `/leads/${lead.id}`)}
			role="button"
			tabindex="0"
			onkeydown={(e) => e.key === 'Enter' && (window.location.href = `/leads/${lead.id}`)}
		>
			<div class="card-check">
				<input type="checkbox" checked={selected.has(lead.id)} onclick={(e) => { e.stopPropagation(); onToggleSelect(lead.id, e); }} />
			</div>
			<div class="card-body">
				<div class="card-top">
					<span class="card-name">{lead.business_name}</span>
					<span class="card-score" style="color: {lead.lead_score !== null && lead.lead_score >= 60 ? 'var(--accent-highlight)' : lead.lead_score !== null && lead.lead_score >= 30 ? '#818cf8' : 'var(--text-muted)'}">{lead.lead_score ?? '—'}</span>
				</div>
				{#if lead.category}
					<div class="card-category">{lead.category}</div>
				{/if}
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
	{#if leads.length === 0}
		<div class="empty card-empty">No leads match your filters.</div>
	{/if}
</div>

<style>
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
	}

	thead th.sortable {
		cursor: pointer;
		user-select: none;
	}

	thead th.sortable:hover {
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

	.category-cell {
		color: var(--text-muted);
		white-space: nowrap;
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

	/* Mobile sort header */
	.mobile-sort-header {
		display: none;
		gap: 0.4rem;
		overflow-x: auto;
		padding-bottom: 0.5rem;
		margin-bottom: 0.5rem;
		border-bottom: 1px solid var(--border-grid);
	}

	.mobile-sort-th {
		flex-shrink: 0;
		background: transparent;
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
		padding: 0.35rem 0.7rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-family: var(--font-ui);
		font-weight: 600;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		white-space: nowrap;
		transition: border-color var(--dur-fast), color var(--dur-fast);
	}

	.mobile-sort-th:hover {
		border-color: var(--accent-primary);
		color: var(--text-primary);
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

	.card-category {
		font-size: 0.72rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
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

	.actions-col {
		white-space: nowrap;
		width: 1px;
	}

	.row-actions {
		display: flex;
		gap: 0.3rem;
		opacity: 0;
		transition: opacity var(--dur-fast);
	}

	tbody tr:hover .row-actions {
		opacity: 1;
	}

	.row-scan-btn {
		background: transparent;
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
		padding: 0.2rem 0.5rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.68rem;
		font-family: var(--font-ui);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		transition: border-color var(--dur-fast), color var(--dur-fast), background var(--dur-fast);
		white-space: nowrap;
	}

	.row-scan-btn.quick:hover:not(:disabled) {
		border-color: rgba(45, 198, 83, 0.4);
		color: #2DC653;
		background: rgba(45, 198, 83, 0.06);
	}

	.row-scan-btn.deep:hover:not(:disabled) {
		border-color: rgba(124, 58, 237, 0.4);
		color: #a78bfa;
		background: rgba(124, 58, 237, 0.08);
	}

	.row-scan-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.table-wrap {
			display: none;
		}

		.mobile-sort-header {
			display: flex;
		}

		.card-list {
			display: flex;
		}
	}
</style>
