<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import type { PageData, ActionData } from './$types';
	import { generateInvoice } from '$lib/docs/invoice';
	import { generateContract } from '$lib/docs/contract';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// ── Edit form state ────────────────────────────────────────────────────────
	let client = $state(untrack(() => ({ ...data.client })));
	let saving = $state(false);
	let saveMsg = $state('');
	let confirmDelete = $state(false);
	let deleting = $state(false);

	$effect(() => {
		if (form?.success) {
			saveMsg = 'Saved.';
			setTimeout(() => (saveMsg = ''), 2500);
		} else if (form?.error) {
			saveMsg = form.error;
			setTimeout(() => (saveMsg = ''), 3000);
		}
	});

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
				clientName: client.name,
				clientAddress: client.address,
				lineItems: lineItems.map((li) => ({ description: li.description, amount: Number(li.amount) || 0 })),
				subtotal,
				tax: Number(taxAmount) || 0,
				total,
				paymentTerms: invoicePaymentTerms
			});
			triggerDownload(bytes, `INV-${invoiceNumber}-${client.name.replace(/\s+/g, '-')}.pdf`);
		} finally {
			generatingInvoice = false;
		}
	}

	// ── Contract state ─────────────────────────────────────────────────────────
	let serviceDesc = $state('');
	let projectValue = $state(0);
	let contractStartDate = $state(todayStr());
	let contractPaymentTerms = $state('50% deposit, 50% on completion');
	let generatingContract = $state(false);

	async function downloadContract() {
		generatingContract = true;
		try {
			const bytes = await generateContract({
				clientName: client.name,
				clientAddress: client.address,
				serviceDesc,
				projectValue: Number(projectValue) || 0,
				mrr: Number(client.mrr) || 0,
				startDate: contractStartDate,
				paymentTerms: contractPaymentTerms
			});
			triggerDownload(bytes, `Contract-${client.name.replace(/\s+/g, '-')}.pdf`);
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

	function fmtMrr(val: unknown) {
		const n = Number(val);
		if (!n) return '—';
		return '$' + n.toFixed(2) + '/mo';
	}
</script>

<main>
	<div class="breadcrumb"><a href="/clients">Clients</a> / {client.name}</div>

	<!-- ── Edit Form ─────────────────────────────────────────────────────────── -->
	<section class="card">
		<h2>Client Details</h2>
		<form method="POST" action="?/update" use:enhance={() => {
			saving = true;
			return async ({ update }) => { saving = false; update(); };
		}}>
			<div class="field-grid">
				<label>
					<span>Name *</span>
					<input name="name" type="text" required bind:value={client.name} />
				</label>
				<label>
					<span>Address *</span>
					<input name="address" type="text" required bind:value={client.address} />
				</label>
				<label>
					<span>Email</span>
					<input name="email" type="email" bind:value={client.email} />
				</label>
				<label>
					<span>Phone</span>
					<input name="phone" type="tel" bind:value={client.phone} />
				</label>
				<label>
					<span>Monthly Retainer ($)</span>
					<input name="mrr" type="number" min="0" step="0.01" bind:value={client.mrr} />
				</label>
			</div>
			<label class="full-width">
				<span>Notes</span>
				<textarea name="notes" rows="3" bind:value={client.notes}></textarea>
			</label>
			<div class="form-actions">
				{#if saveMsg}
					<span class="save-msg" class:error={form?.error}>{saveMsg}</span>
				{/if}
				<button type="submit" class="btn-primary" disabled={saving}>
					{saving ? 'Saving…' : 'Save Changes'}
				</button>
			</div>
		</form>
		<div class="form-actions delete-row">
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
	</section>

	<!-- ── Documents ─────────────────────────────────────────────────────────── -->
	<section class="card documents">
		<h2>Documents</h2>

		<!-- Invoice -->
		<div class="doc-section">
			<h3>Invoice</h3>
			<div class="field-grid">
				<label>
					<span>Invoice Number</span>
					<input type="text" bind:value={invoiceNumber} placeholder="INV-001" />
				</label>
				<label>
					<span>Issue Date</span>
					<input type="date" bind:value={issueDate} />
				</label>
				<label>
					<span>Due Date</span>
					<input type="date" bind:value={dueDate} />
				</label>
				<label>
					<span>Tax Amount ($)</span>
					<input type="number" min="0" step="0.01" bind:value={taxAmount} placeholder="0" />
				</label>
			</div>

			<label class="full-width">
				<span>Payment Terms</span>
				<input type="text" bind:value={invoicePaymentTerms} />
			</label>

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

			<button class="btn-primary" onclick={downloadInvoice} disabled={generatingInvoice}>
				{generatingInvoice ? 'Generating…' : 'Download Invoice PDF'}
			</button>
		</div>

		<div class="divider"></div>

		<!-- Contract -->
		<div class="doc-section">
			<h3>Contract</h3>
			<div class="prefilled-row">
				<span class="prefilled-label">Client</span>
				<span class="prefilled-value">{client.name} — {client.address}</span>
			</div>
			{#if Number(client.mrr) > 0}
				<div class="prefilled-row">
					<span class="prefilled-label">Monthly Retainer</span>
					<span class="prefilled-value">{fmtMrr(client.mrr)}</span>
				</div>
			{/if}

			<label class="full-width">
				<span>Service Description</span>
				<textarea rows="3" bind:value={serviceDesc} placeholder="2–3 sentences describing the scope of work…"></textarea>
			</label>

			<div class="field-grid">
				<label>
					<span>Project Value ($, if applicable)</span>
					<input type="number" min="0" step="0.01" bind:value={projectValue} placeholder="0" />
				</label>
				<label>
					<span>Start Date</span>
					<input type="date" bind:value={contractStartDate} />
				</label>
			</div>

			<label class="full-width">
				<span>Payment Terms</span>
				<input type="text" bind:value={contractPaymentTerms} />
			</label>

			<button class="btn-primary" onclick={downloadContract} disabled={generatingContract}>
				{generatingContract ? 'Generating…' : 'Download Contract PDF'}
			</button>
		</div>
	</section>
</main>

<style>
	main {
		max-width: 860px;
		margin: 0 auto;
		padding: 2rem;
	}

	.breadcrumb {
		font-size: 0.85rem;
		color: #64748b;
		margin-bottom: 1.25rem;
	}

	h2 {
		font-size: 1rem;
		font-weight: 700;
		margin-bottom: 1.25rem;
	}

	h3 {
		font-size: 0.95rem;
		font-weight: 600;
		margin-bottom: 1rem;
		color: #94a3b8;
	}

	.card {
		background: #10101a;
		border: 1px solid #1a1a2e;
		border-radius: 10px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.field-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
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

	.full-width {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-bottom: 0.75rem;
	}

	input,
	textarea {
		background: #13131f;
		border: 1px solid #2a2a3e;
		color: #e2e8f0;
		padding: 0.4rem 0.6rem;
		border-radius: 6px;
		outline: none;
		transition: border-color 0.15s;
		width: 100%;
	}

	input:focus,
	textarea:focus {
		border-color: #7c3aed;
	}

	textarea {
		resize: vertical;
	}

	.form-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 1rem;
	}

	.delete-row {
		margin-top: 0.5rem;
	}

	.save-msg {
		font-size: 0.85rem;
		color: #4ade80;
	}

	.save-msg.error {
		color: #f87171;
	}

	/* Buttons */
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

	.btn-secondary {
		background: transparent;
		border: 1px solid #2a2a3e;
		color: #94a3b8;
		padding: 0.4rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}

	.btn-secondary:hover {
		border-color: #64748b;
		color: #e2e8f0;
	}

	.btn-sm {
		padding: 0.25rem 0.6rem;
		font-size: 0.85rem;
		margin-top: 0.5rem;
	}

	.btn-danger {
		background: transparent;
		border: 1px solid #7f1d1d;
		color: #f87171;
		padding: 0.4rem 0.75rem;
		border-radius: 6px;
		cursor: pointer;
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
	}

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

	/* Documents */
	.documents .doc-section {
		margin-bottom: 0.5rem;
	}

	.divider {
		border-top: 1px solid #1a1a2e;
		margin: 1.5rem 0;
	}

	/* Line items */
	.line-items {
		margin-bottom: 1rem;
	}

	.line-items-header {
		display: flex;
		gap: 0.5rem;
		padding: 0 0 0.4rem 0;
		font-size: 0.78rem;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.line-item-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		align-items: center;
	}

	.col-desc {
		flex: 1;
	}

	.col-amt {
		width: 120px;
	}

	.col-rm {
		width: 28px;
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
		font-size: 0.8rem;
		color: #64748b;
		font-weight: 500;
		min-width: 120px;
	}

	.prefilled-value {
		font-size: 0.9rem;
		color: #94a3b8;
	}
</style>
