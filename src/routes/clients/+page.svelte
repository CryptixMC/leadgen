<script lang="ts">
	import type { PageData } from './$types';
	import type { Client } from '$lib/api';

	let { data }: { data: PageData } = $props();

	const clients = data.clients as Client[];
	const total_mrr = data.total_mrr as number;

	function formatMrr(val: number) {
		return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
	}

	function formatDate(d: string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-CA');
	}
</script>

<div class="page">
	<div class="header">
		<h1>Clients</h1>
		<div class="mrr-display">
			<span class="mrr-label">Total MRR</span>
			<span class="mrr-value">{formatMrr(total_mrr)}<span class="mrr-mo">/mo</span></span>
		</div>
	</div>

	{#if clients.length === 0}
		<div class="empty">No clients yet. Close a deal in the pipeline to get started.</div>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Business</th>
						<th>Services</th>
						<th class="num">MRR</th>
						<th>Contract Start</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each clients as client}
						<tr onclick={() => (window.location.href = `/clients/${client.id}`)}>
							<td class="name">{client.business_name}</td>
							<td class="services">
								{#if client.service_website}
									<span class="badge badge-website">Website</span>
								{/if}
								{#if client.service_tools}
									<span class="badge badge-tools">Tools</span>
								{/if}
								{#if client.service_hosting}
									<span class="badge badge-hosting">Hosting</span>
								{/if}
								{#if !client.service_website && !client.service_tools && !client.service_hosting}
									<span class="none">—</span>
								{/if}
							</td>
							<td class="num mrr-cell">{formatMrr(client.mrr)}<span class="mo">/mo</span></td>
							<td class="date">{formatDate(client.contract_start)}</td>
							<td class="view-cell"><a href="/clients/{client.id}" onclick={(e) => e.stopPropagation()}>View →</a></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 1100px;
		margin: 2rem auto;
		padding: 0 1.5rem;
	}

	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	h1 {
		font-size: 1.6rem;
		color: var(--text-primary);
	}

	.mrr-display {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.mrr-label {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		font-weight: 600;
	}

	.mrr-value {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 700;
		color: var(--state-success);
		line-height: 1.1;
	}

	.mrr-mo {
		font-size: 1rem;
		color: var(--text-muted);
		font-weight: 400;
	}

	.table-wrap {
		overflow-x: auto;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-subtle);
	}

	table {
		width: 100%;
		border-collapse: collapse;
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

	th.num {
		text-align: right;
	}

	tbody tr {
		border-top: 1px solid var(--border-grid);
		cursor: pointer;
		transition: background var(--dur-fast);
	}

	tbody tr:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	td {
		padding: 0.75rem 1rem;
		font-size: 0.9rem;
		border-top: 1px solid #1a1a2e;
		color: #94a3b8;
	}

	tr:hover td {
		background: #10101a;
		cursor: pointer;
	}

	.name {
		color: var(--text-primary);
		font-weight: 500;
		white-space: nowrap;
	}

	.services {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
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

	.badge-website {
		background: rgba(96, 165, 250, 0.1);
		border: 1px solid rgba(96, 165, 250, 0.25);
		color: #60a5fa;
	}

	.badge-tools {
		background: rgba(124, 58, 237, 0.12);
		border: 1px solid rgba(124, 58, 237, 0.3);
		color: #a78bfa;
	}

	.badge-hosting {
		background: rgba(45, 198, 83, 0.1);
		border: 1px solid rgba(45, 198, 83, 0.3);
		color: #2DC653;
	}

	.num {
		text-align: right;
	}

	.mrr-cell {
		font-family: var(--font-display);
		font-weight: 600;
		color: var(--state-success);
	}

	.mo {
		color: var(--text-muted);
		font-weight: 400;
		font-size: 0.8em;
	}

	.date {
		color: var(--text-muted);
		white-space: nowrap;
	}

	.none {
		color: var(--text-muted);
		opacity: 0.4;
	}

	.view-cell {
		text-align: right;
		white-space: nowrap;
	}

	.empty {
		color: var(--text-muted);
		text-align: center;
		opacity: 0.5;
		padding: 4rem 2rem;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border-subtle);
		font-size: 0.95rem;
	}
</style>
