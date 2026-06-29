<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import type { Client } from '$lib/api';
	import { generateInvoice } from '$lib/docs/invoice';
	import { generateContract } from '$lib/docs/contract';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const client = data.client as Client;

	// ── Invoice state ──────────────────────────────────────────────────────────
	function todayStr() {
		return new Date().toISOString().slice(0, 10);
	}
	function futureDateStr(days: number) {
		const d = new Date();
		d.setDate(d.getDate() + days);
		return d.toISOString().slice(0, 10);
	}

	let invoiceNumber = $state('INV-001');
	let issueDate = $state(todayStr());
	let dueDate = $state(futureDateStr(14));
	let lineItems = $state([{ description: '', amount: 0 }]);
	let taxAmount = $state(0);
	let invoicePaymentTerms = $state('E-transfer to liam@liamnicholson.ca');
	let generatingInvoice = $state(false);

	let subtotal = $derived(lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
	let total = $derived(subtotal + (Number(taxAmount) || 0));

	function addLineItem() {
		lineItems = [...lineItems, { description: '', amount: 0 }];
	}

	function removeLineItem(i: number) {
		lineItems = lineItems.filter((_, idx) => idx !== i);
	}

	function updateItem(i: number, field: 'description' | 'amount', value: string) {
		lineItems = lineItems.map((item, idx) =>
			idx === i ? { ...item, [field]: field === 'amount' ? parseFloat(value) || 0 : value } : item
		);
	}

	async function downloadInvoice() {
		generatingInvoice = true;
		try {
			const bytes = await generateInvoice({
				invoiceNumber,
				issueDate,
				dueDate,
				clientName: client.business_name,
				clientAddress: client.address ?? '',
				lineItems: lineItems.map((li) => ({ description: li.description, amount: Number(li.amount) || 0 })),
				subtotal,
				tax: Number(taxAmount) || 0,
				total,
				paymentTerms: invoicePaymentTerms
			});
			triggerDownload(bytes, `INV-${invoiceNumber}-${client.business_name.replace(/\s+/g, '-')}.pdf`);
		} finally {
			generatingInvoice = false;
		}
	}

	// ── Contract state ─────────────────────────────────────────────────────────
	let serviceDesc = $state('');
	let contractProjectValue = $state(client.project_value ?? 0);
	let contractStartDate = $state(client.contract_start ?? todayStr());
	let contractPaymentTerms = $state('50% deposit, 50% on completion');
	let generatingContract = $state(false);

	async function downloadContract() {
		generatingContract = true;
		try {
			const bytes = await generateContract({
				clientName: client.business_name,
				clientAddress: client.address ?? '',
				serviceDesc,
				projectValue: Number(contractProjectValue) || 0,
				mrr: Number(client.mrr) || 0,
				startDate: contractStartDate,
				paymentTerms: contractPaymentTerms
			});
			triggerDownload(bytes, `Contract-${client.business_name.replace(/\s+/g, '-')}.pdf`);
		} finally {
			generatingContract = false;
		}
	}

	// ── Utility ────────────────────────────────────────────────────────────────
	function triggerDownload(bytes: Uint8Array, filename: string) {
		const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	function fmtMrr(val: number) {
		if (!val) return '—';
		return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '/mo';
	}

	// ── Delete state ───────────────────────────────────────────────────────────
	let confirmDelete = $state(false);
	let deleting = $state(false);
</script>

<div class="page">
	<a href="/clients" class="back">← Clients</a>

	<h1>{client.business_name}</h1>

	{#if form?.success}
		<div class="feedback success">Saved.</div>
	{:else if form?.error}
		<div class="feedback error">{form.error}</div>
	{/if}

	<!-- ── Edit Form ───────────────────────────────────────────────────────────── -->
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

	<div class="delete-row">
		{#if confirmDelete}
			<form method="POST" action="?/delete" use:enhance={() => {
				deleting = true;
				return async ({ update }) => { deleting = false; update(); };
			}}>
				<button type="submit" class="btn-danger-confirm" disabled={deleting}>
					{deleting ? 'Deleting…' : 'Confirm Delete'}
				</button>
			</form>
			<button class="btn-secondary" onclick={() => (confirmDelete = false)}>Cancel</button>
		{:else}
			<button type="button" class="btn-danger" onclick={() => (confirmDelete = true)}>Delete Client</button>
		{/if}
	</div>

	<!-- ── Documents ─────────────────────────────────────────────────────────── -->
	<div class="docs-card">
		<h2>Documents</h2>

		<!-- Invoice -->
		<div class="doc-section">
			<h3>Invoice</h3>
			<div class="form-grid">
				<div class="field">
					<label>Invoice Number</label>
					<input type="text" bind:value={invoiceNumber} placeholder="INV-001" />
				</div>
				<div class="field">
					<label>Issue Date</label>
					<input type="date" bind:value={issueDate} />
				</div>
				<div class="field">
					<label>Due Date</label>
					<input type="date" bind:value={dueDate} />
				</div>
				<div class="field">
					<label>Tax Amount ($)</label>
					<input type="number" min="0" step="0.01" bind:value={taxAmount} placeholder="0" />
				</div>
				<div class="field full">
					<label>Payment Terms</label>
					<input type="text" bind:value={invoicePaymentTerms} />
				</div>
			</div>

			<div class="line-items">
				<div class="line-items-header">
					<span class="col-desc">Description</span>
					<span class="col-amt">Amount ($)</span>
					<span class="col-rm"></span>
				</div>
				{#each lineItems as item, i}
					<div class="line-item-row">
						<input
							class="col-desc"
							type="text"
							value={item.description}
							placeholder="Service description"
							oninput={(e) => updateItem(i, 'description', (e.target as HTMLInputElement).value)}
						/>
						<input
							class="col-amt"
							type="number"
							min="0"
							step="0.01"
							value={item.amount}
							placeholder="0.00"
							oninput={(e) => updateItem(i, 'amount', (e.target as HTMLInputElement).value)}
						/>
						<button
							class="btn-remove"
							onclick={() => removeLineItem(i)}
							disabled={lineItems.length === 1}
							title="Remove row"
						>×</button>
					</div>
				{/each}
				<button class="btn-secondary btn-sm" onclick={addLineItem}>+ Add Row</button>
			</div>

			<div class="totals">
				<span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
				{#if Number(taxAmount) > 0}
					<span>Tax</span><span>${Number(taxAmount).toFixed(2)}</span>
				{/if}
				<span class="total-label">Total</span><span class="total-value">${total.toFixed(2)}</span>
			</div>

			<button class="save-btn" onclick={downloadInvoice} disabled={generatingInvoice}>
				{generatingInvoice ? 'Generating…' : 'Download Invoice PDF'}
			</button>
		</div>

		<div class="divider"></div>

		<!-- Contract -->
		<div class="doc-section">
			<h3>Contract</h3>
			<div class="prefilled-row">
				<span class="prefilled-label">Client</span>
				<span class="prefilled-value">{client.business_name}{client.address ? ' — ' + client.address : ''}</span>
			</div>
			{#if Number(client.mrr) > 0}
				<div class="prefilled-row">
					<span class="prefilled-label">Monthly Retainer</span>
					<span class="prefilled-value">{fmtMrr(client.mrr)}</span>
				</div>
			{/if}

			<div class="form-grid">
				<div class="field full">
					<label>Service Description</label>
					<textarea rows="3" bind:value={serviceDesc} placeholder="2–3 sentences describing the scope of work…"></textarea>
				</div>
				<div class="field">
					<label>Project Value ($)</label>
					<input type="number" min="0" step="0.01" bind:value={contractProjectValue} placeholder="0" />
				</div>
				<div class="field">
					<label>Start Date</label>
					<input type="date" bind:value={contractStartDate} />
				</div>
				<div class="field full">
					<label>Payment Terms</label>
					<input type="text" bind:value={contractPaymentTerms} />
				</div>
			</div>

			<button class="save-btn" onclick={downloadContract} disabled={generatingContract}>
				{generatingContract ? 'Generating…' : 'Download Contract PDF'}
			</button>
		</div>
	</div>
</div>

<style>
	.page {
		max-width: 720px;
		margin: 2rem auto;
		padding: 0 1.5rem 4rem;
	}

	.back {
		display: inline-block;
		color: #64748b;
		font-size: 0.85rem;
		margin-bottom: 1.25rem;
		transition: color 0.15s;
	}

	.back:hover {
		color: #d946ef;
	}

	h1 {
		font-size: 1.5rem;
		color: #f1f5f9;
		margin-bottom: 1.5rem;
	}

	h2 {
		font-size: 1rem;
		font-weight: 700;
		margin-bottom: 1.25rem;
	}

	h3 {
		font-size: 0.9rem;
		font-weight: 600;
		color: #94a3b8;
		margin-bottom: 1rem;
	}

	.feedback {
		padding: 0.6rem 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		margin-bottom: 1.25rem;
	}

	.feedback.success {
		background: #14291a;
		color: #4ade80;
		border: 1px solid #166534;
	}

	.feedback.error {
		background: #2a1a1a;
		color: #f87171;
		border: 1px solid #7f1d1d;
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
		font-size: 0.75rem;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	input[type='text'],
	input[type='email'],
	input[type='number'],
	input[type='date'],
	textarea {
		background: #10101a;
		border: 1px solid #1a1a2e;
		border-radius: 6px;
		color: #e2e8f0;
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
		width: 100%;
		transition: border-color 0.15s;
	}

	input[type='text']:focus,
	input[type='email']:focus,
	input[type='number']:focus,
	input[type='date']:focus,
	textarea:focus {
		outline: none;
		border-color: #7c3aed;
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
		color: #e2e8f0;
		text-transform: none;
		letter-spacing: normal;
		font-weight: 400;
		cursor: pointer;
	}

	input[type='checkbox'] {
		accent-color: #7c3aed;
		cursor: pointer;
		width: 15px;
		height: 15px;
	}

	.actions {
		margin-top: 1.75rem;
	}

	.save-btn {
		background: #7c3aed;
		border: none;
		color: #fff;
		padding: 0.55rem 1.5rem;
		border-radius: 6px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.save-btn:hover:not(:disabled) {
		background: #6d28d9;
	}

	.save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* Delete */
	.delete-row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin-top: 1rem;
	}

	.btn-danger {
		background: transparent;
		border: 1px solid #7f1d1d;
		color: #f87171;
		padding: 0.4rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
		transition: background 0.15s, border-color 0.15s;
	}

	.btn-danger:hover {
		background: #7f1d1d22;
		border-color: #f87171;
	}

	.btn-danger-confirm {
		background: #7f1d1d;
		border: 1px solid #f87171;
		color: #f87171;
		padding: 0.4rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.btn-secondary {
		background: transparent;
		border: 1px solid #2a2a3e;
		color: #94a3b8;
		padding: 0.4rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
		transition: border-color 0.15s, color 0.15s;
	}

	.btn-secondary:hover {
		border-color: #64748b;
		color: #e2e8f0;
	}

	.btn-sm {
		padding: 0.25rem 0.6rem;
		font-size: 0.82rem;
		margin-top: 0.5rem;
	}

	/* Documents card */
	.docs-card {
		background: #10101a;
		border: 1px solid #1a1a2e;
		border-radius: 10px;
		padding: 1.5rem;
		margin-top: 2.5rem;
	}

	.doc-section {
		margin-bottom: 0.5rem;
	}

	.divider {
		border-top: 1px solid #1a1a2e;
		margin: 1.5rem 0;
	}

	/* Line items */
	.line-items {
		margin: 1rem 0;
	}

	.line-items-header {
		display: flex;
		gap: 0.5rem;
		padding-bottom: 0.4rem;
		font-size: 0.72rem;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-weight: 600;
	}

	.line-item-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		align-items: center;
	}

	.col-desc { flex: 1; }
	.col-amt  { width: 130px; }
	.col-rm   { width: 28px; }

	.btn-remove {
		background: transparent;
		border: 1px solid #2a2a3e;
		color: #64748b;
		width: 28px;
		height: 28px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		flex-shrink: 0;
		transition: border-color 0.15s, color 0.15s;
	}

	.btn-remove:hover:not(:disabled) {
		border-color: #f87171;
		color: #f87171;
	}

	.btn-remove:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Totals */
	.totals {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.3rem 1.5rem;
		width: 220px;
		margin-left: auto;
		margin-bottom: 1.25rem;
		font-size: 0.9rem;
		color: #94a3b8;
	}

	.total-label,
	.total-value {
		color: #e2e8f0;
		font-weight: 700;
		border-top: 1px solid #2a2a3e;
		padding-top: 0.3rem;
		margin-top: 0.1rem;
	}

	/* Prefilled rows */
	.prefilled-row {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
		margin-bottom: 0.75rem;
	}

	.prefilled-label {
		font-size: 0.75rem;
		color: #64748b;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		min-width: 120px;
	}

	.prefilled-value {
		font-size: 0.9rem;
		color: #94a3b8;
	}
</style>
