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
	}

	thead tr {
		background: #10101a;
	}

	th {
		text-align: left;
		font-size: 0.72rem;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
		padding: 0.65rem 1rem;
	}

	th.num {
		text-align: right;
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
		color: #e2e8f0;
		font-weight: 500;
	}

	.services {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.badge-website { background: #1e1b4b; color: #818cf8; }
	.badge-tools   { background: #3b0764; color: #d946ef; }
	.badge-hosting { background: #14291a; color: #4ade80; }

	.none { color: #2a2a3e; }

	.num { text-align: right; }

	.mrr-cell {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.85rem;
		color: #4ade80;
		text-align: right;
	}

	.mo {
		font-size: 0.72rem;
		color: #64748b;
	}

	.date { color: #64748b; }

	.view-cell a {
		font-size: 0.82rem;
		color: #7c3aed;
	}

	.empty {
		color: #64748b;
		text-align: center;
		padding: 4rem;
		border: 1px dashed #1a1a2e;
		border-radius: 10px;
	}
</style>
