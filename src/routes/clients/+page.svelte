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
		color: #f1f5f9;
	}

	.mrr-display {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.mrr-label {
		font-size: 0.72rem;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		font-weight: 600;
	}

	.mrr-value {
		font-family: 'JetBrains Mono', monospace;
		font-size: 2rem;
		font-weight: 700;
		color: #4ade80;
		line-height: 1.1;
	}

	.mrr-mo {
		font-size: 1rem;
		color: #64748b;
		font-weight: 400;
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

	.services {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
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

	.badge-website {
		background: #1e2a4a;
		color: #60a5fa;
	}

	.badge-tools {
		background: #2a1a4e;
		color: #a78bfa;
	}

	.badge-hosting {
		background: #14291a;
		color: #4ade80;
	}

	.num {
		text-align: right;
	}

	.mrr-cell {
		font-family: 'JetBrains Mono', monospace;
		font-weight: 600;
		color: #4ade80;
	}

	.mo {
		color: #64748b;
		font-weight: 400;
		font-size: 0.8em;
	}

	.date {
		color: #94a3b8;
		white-space: nowrap;
	}

	.none {
		color: #4a5568;
	}

	.view-cell {
		text-align: right;
		white-space: nowrap;
	}

	.empty {
		text-align: center;
		color: #4a5568;
		padding: 4rem 2rem;
		border-radius: 10px;
		border: 1px solid #1a1a2e;
		font-size: 0.95rem;
	}
</style>
