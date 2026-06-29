<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreate = $state(false);
	let creating = $state(false);
</script>

<main>
	<div class="header-row">
		<h1>Clients</h1>
		<button class="btn-primary" onclick={() => (showCreate = !showCreate)}>
			{showCreate ? 'Cancel' : '+ New Client'}
		</button>
	</div>

	{#if showCreate}
		<section class="card create-form">
			<h2>New Client</h2>
			{#if form?.error}
				<p class="error">{form.error}</p>
			{/if}
			<form method="POST" action="?/create" use:enhance={() => {
				creating = true;
				return async ({ update }) => { creating = false; update(); };
			}}>
				<div class="field-grid">
					<label>
						<span>Name *</span>
						<input name="name" type="text" required placeholder="Acme Corp" />
					</label>
					<label>
						<span>Address *</span>
						<input name="address" type="text" required placeholder="123 Main St, Winnipeg, MB" />
					</label>
					<label>
						<span>Email</span>
						<input name="email" type="email" placeholder="contact@acme.com" />
					</label>
					<label>
						<span>Phone</span>
						<input name="phone" type="tel" placeholder="204-555-0100" />
					</label>
					<label>
						<span>Monthly Retainer ($)</span>
						<input name="mrr" type="number" min="0" step="0.01" placeholder="0" />
					</label>
				</div>
				<button type="submit" class="btn-primary" disabled={creating}>
					{creating ? 'Creating…' : 'Create Client'}
				</button>
			</form>
		</section>
	{/if}

	{#if data.clients.length === 0}
		<p class="empty">No clients yet. Create one above.</p>
	{:else}
		<section class="card">
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Address</th>
						<th>Email</th>
						<th>Phone</th>
						<th>MRR</th>
					</tr>
				</thead>
				<tbody>
					{#each data.clients as client}
						<tr onclick={() => (window.location.href = `/clients/${client.id}`)}>
							<td class="name-cell"><a href="/clients/{client.id}">{client.name}</a></td>
							<td>{client.address}</td>
							<td>{client.email ?? '—'}</td>
							<td>{client.phone ?? '—'}</td>
							<td>{client.mrr > 0 ? '$' + Number(client.mrr).toFixed(2) + '/mo' : '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 2rem;
	}

	.header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	h1 {
		font-size: 1.4rem;
		font-weight: 700;
	}

	h2 {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.card {
		background: #10101a;
		border: 1px solid #1a1a2e;
		border-radius: 10px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.create-form .field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	label span {
		font-size: 0.8rem;
		color: #64748b;
		font-weight: 500;
	}

	input {
		background: #13131f;
		border: 1px solid #2a2a3e;
		color: #e2e8f0;
		padding: 0.4rem 0.6rem;
		border-radius: 6px;
		outline: none;
		transition: border-color 0.15s;
	}

	input:focus {
		border-color: #7c3aed;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		text-align: left;
		font-size: 0.75rem;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.5rem 0.75rem;
		background: #10101a;
	}

	td {
		padding: 0.65rem 0.75rem;
		font-size: 0.9rem;
		border-top: 1px solid #1a1a2e;
		color: #94a3b8;
	}

	.name-cell {
		color: #e2e8f0;
		font-weight: 500;
	}

	tr:hover td {
		background: #13131f;
		cursor: pointer;
	}

	.btn-primary {
		background: #7c3aed;
		border: none;
		color: #fff;
		padding: 0.4rem 0.9rem;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 600;
		transition: background 0.15s;
	}

	.btn-primary:hover:not(:disabled) {
		background: #6d28d9;
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error {
		color: #f87171;
		font-size: 0.875rem;
		margin-bottom: 0.75rem;
	}

	.empty {
		color: #64748b;
		text-align: center;
		padding: 3rem;
	}
</style>
