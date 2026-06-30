<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import type { Client } from '$lib/api';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const client = data.client as Client;
</script>

<div class="page">
	<a href="/clients" class="back">← Clients</a>

	<h1>{client.business_name}</h1>

	{#if form?.success}
		<div class="feedback success">Saved.</div>
	{:else if form?.error}
		<div class="feedback error">{form.error}</div>
	{/if}

	<form method="POST" action="?/save" use:enhance>
		<div class="form-grid">
			<div class="field">
				<label for="contact_name">Contact Name</label>
				<input id="contact_name" name="contact_name" type="text" value={client.contact_name ?? ''} placeholder="Jane Smith" />
			</div>

			<div class="field">
				<label for="phone">Phone</label>
				<input id="phone" name="phone" type="text" value={client.phone ?? ''} placeholder="(204) 555-0100" />
			</div>

			<div class="field">
				<label for="email">Email</label>
				<input id="email" name="email" type="email" value={client.email ?? ''} placeholder="owner@example.com" />
			</div>

			<div class="field">
				<label for="address">Address</label>
				<input id="address" name="address" type="text" value={client.address ?? ''} placeholder="123 Main St, Winnipeg, MB" />
			</div>

			<div class="field">
				<label for="mrr">MRR ($/mo)</label>
				<input id="mrr" name="mrr" type="number" step="0.01" min="0" value={client.mrr} placeholder="0.00" />
			</div>

			<div class="field">
				<label for="project_value">Project Value ($)</label>
				<input id="project_value" name="project_value" type="number" step="0.01" min="0" value={client.project_value} placeholder="0.00" />
			</div>

			<div class="field">
				<label for="contract_start">Contract Start</label>
				<input id="contract_start" name="contract_start" type="date" value={client.contract_start ?? ''} />
			</div>

			<div class="field services-field">
				<span class="services-label">Services</span>
				<div class="checkboxes">
					<label class="checkbox-label">
						<input type="checkbox" name="service_website" checked={client.service_website} />
						Website
					</label>
					<label class="checkbox-label">
						<input type="checkbox" name="service_tools" checked={client.service_tools} />
						Tools
					</label>
					<label class="checkbox-label">
						<input type="checkbox" name="service_hosting" checked={client.service_hosting} />
						Hosting
					</label>
				</div>
			</div>

			<div class="field full">
				<label for="notes">Notes</label>
				<textarea id="notes" name="notes" rows="5" placeholder="Internal notes about this client...">{client.notes ?? ''}</textarea>
			</div>
		</div>

		<div class="actions">
			<button type="submit" class="save-btn">Save</button>
		</div>
	</form>
</div>

<style>
	.page {
		max-width: 720px;
		margin: 2rem auto;
		padding: 0 1.5rem 4rem;
	}

	.back {
		display: inline-block;
		color: var(--text-muted);
		font-size: 0.85rem;
		margin-bottom: 1.25rem;
		transition: color var(--dur-fast);
		text-decoration: none;
	}

	.back:hover {
		color: var(--accent-highlight);
	}

	h1 {
		font-size: 1.5rem;
		color: var(--text-primary);
		margin-bottom: 1.5rem;
	}

	.feedback {
		padding: 0.6rem 1rem;
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		margin-bottom: 1.25rem;
	}

	.feedback.success {
		background: rgba(45, 198, 83, 0.08);
		color: var(--state-success);
		border: 1px solid rgba(45, 198, 83, 0.25);
	}

	.feedback.error {
		background: rgba(248, 113, 113, 0.08);
		color: #f87171;
		border: 1px solid rgba(248, 113, 113, 0.2);
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.25rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.field.full {
		grid-column: 1 / -1;
	}

	.field.services-field {
		grid-column: 1 / -1;
	}

	label,
	.services-label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	input[type='text'],
	input[type='email'],
	input[type='number'],
	input[type='date'],
	textarea {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
		width: 100%;
		transition: border-color var(--dur-fast);
	}

	input[type='text']:focus,
	input[type='email']:focus,
	input[type='number']:focus,
	input[type='date']:focus,
	textarea:focus {
		outline: none;
		border-color: var(--accent-primary);
	}

	textarea {
		resize: vertical;
	}

	.checkboxes {
		display: flex;
		gap: 1.5rem;
		margin-top: 0.25rem;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		color: var(--text-primary);
		text-transform: none;
		letter-spacing: normal;
		font-weight: 400;
		cursor: pointer;
		font-family: var(--font-body);
	}

	input[type='checkbox'] {
		accent-color: var(--accent-primary);
		cursor: pointer;
		width: 15px;
		height: 15px;
	}

	.actions {
		margin-top: 1.75rem;
	}

	.save-btn {
		background: var(--gradient-primary);
		border: none;
		color: var(--bg-base);
		padding: 0.55rem 1.5rem;
		border-radius: var(--radius-pill);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: box-shadow var(--dur-fast), transform var(--dur-fast);
	}

	.save-btn:hover {
		box-shadow: var(--glow-cta);
		transform: translateY(-1px);
	}
</style>
