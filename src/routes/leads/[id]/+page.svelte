<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import { updateLead, deleteLead, enrichLead, generateEmail, sendLeadEmail, type Lead } from '$lib/api';
	import { EMAIL_TEMPLATES, fillTemplate, type EmailTemplate } from '$lib/emailTemplates';
	import { goto } from '$app/navigation';

	type ContactEvent = { id: string; type: string; notes: string | null; created_at: string };

	let { data }: { data: PageData } = $props();

	let activityType = $state<'email' | 'call' | 'visit' | 'note'>('call');
	let activitySubmitting = $state(false);

	let lead = $state<Lead>(untrack(() => data.lead));
	let notes = $state(untrack(() => lead.notes ?? ''));
	let saving = $state(false);
	let saveMsg = $state('');
	let confirmDelete = $state(false);
	let deleting = $state(false);
	let enriching = $state(false);
	let enrichMsg = $state('');

	const STATUSES = ['cold', 'contacted', 'proposal', 'closed_won', 'closed_lost'];

	async function changeStatus(e: Event) {
		const select = e.target as HTMLSelectElement;
		const newStatus = select.value;
		try {
			lead = await updateLead(lead.id, { status: newStatus });
			saveMsg = 'Status saved.';
		} catch {
			saveMsg = 'Failed to save status.';
		}
		setTimeout(() => (saveMsg = ''), 2000);
	}

	async function saveNotes() {
		saving = true;
		try {
			lead = await updateLead(lead.id, { notes });
			saveMsg = 'Notes saved.';
		} catch {
			saveMsg = 'Failed to save notes.';
		} finally {
			saving = false;
		}
		setTimeout(() => (saveMsg = ''), 2500);
	}

	function fmt(val: unknown) {
		if (val === null || val === undefined) return '—';
		if (typeof val === 'boolean') return val ? 'Yes' : 'No';
		return String(val);
	}

	async function handleEnrich() {
		enriching = true;
		enrichMsg = '';
		try {
			lead = await enrichLead(lead.id);
			enrichMsg = 'Enriched!';
		} catch {
			enrichMsg = 'Enrichment failed.';
		} finally {
			enriching = false;
		}
		setTimeout(() => (enrichMsg = ''), 3000);
	}

	async function handleDelete() {
		if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		deleting = true;
		try {
			await deleteLead(lead.id);
			goto('/');
		} catch {
			saveMsg = 'Failed to delete lead.';
			deleting = false;
			confirmDelete = false;
			setTimeout(() => (saveMsg = ''), 2500);
		}
	}

	// --- Email compose state ---
	let emailModalOpen = $state(false);
	let selectedTemplate = $state<EmailTemplate>(EMAIL_TEMPLATES[0]);
	let senderName = $state('');
	let extraContext = $state('');
	let emailSubject = $state('');
	let emailBody = $state('');
	let generating = $state(false);
	let generateError = $state('');
	let sending = $state(false);
	let sendError = $state('');
	let sendSuccess = $state(false);
	let markContacted = $state(false);

	const defaultTemplate = $derived(
		EMAIL_TEMPLATES.find((t) => t.condition?.(lead)) ?? EMAIL_TEMPLATES[2]
	);

	function getTemplateVars() {
		const city = (lead.address ?? '').split(',')[1]?.trim() ?? '';
		return { business_name: lead.business_name, city, sender_name: senderName };
	}

	function openEmailModal() {
		selectedTemplate = defaultTemplate;
		markContacted = lead.status === 'cold';
		generateError = '';
		sendError = '';
		sendSuccess = false;
		const vars = getTemplateVars();
		emailSubject = fillTemplate(selectedTemplate.subject, vars);
		emailBody = fillTemplate(selectedTemplate.body, vars);
		emailModalOpen = true;
	}

	function onTemplateChange() {
		const vars = getTemplateVars();
		emailSubject = fillTemplate(selectedTemplate.subject, vars);
		emailBody = fillTemplate(selectedTemplate.body, vars);
		generateError = '';
	}

	async function handleGenerate() {
		generating = true;
		generateError = '';
		try {
			const result = await generateEmail(lead.id, {
				templateSubject: emailSubject,
				templateBody: emailBody,
				senderName: senderName || 'Your Name',
				extraContext
			});
			emailSubject = result.subject;
			emailBody = result.body;
		} catch (e) {
			generateError = e instanceof Error ? e.message : 'AI generation failed.';
		} finally {
			generating = false;
		}
	}

	async function handleSendEmail() {
		sending = true;
		sendError = '';
		try {
			const updated = await sendLeadEmail(lead.id, {
				subject: emailSubject,
				emailBody,
				markContacted
			});
			lead = updated;
			notes = updated.notes ?? '';
			sendSuccess = true;
			setTimeout(() => {
				emailModalOpen = false;
				sendSuccess = false;
			}, 1800);
		} catch (e) {
			sendError = e instanceof Error ? e.message : 'Failed to send email.';
		} finally {
			sending = false;
		}
	}

	function scoreColor(s: number | null) {
		if (s === null) return '#64748b';
		if (s >= 60) return '#d946ef';
		if (s >= 30) return '#818cf8';
		return '#64748b';
	}

	function psColor(s: number | null) {
		if (s === null) return '#64748b';
		if (s >= 70) return '#4ade80';
		if (s >= 50) return '#facc15';
		return '#f87171';
	}

	function fmtEventDate(iso: string): string {
		const d = new Date(iso);
		const now = new Date();
		const todayStr = now.toDateString();
		const yest = new Date(now); yest.setDate(now.getDate() - 1);
		if (d.toDateString() === todayStr) return 'Today';
		if (d.toDateString() === yest.toDateString()) return 'Yesterday';
		const month = d.toLocaleString('en', { month: 'short' });
		const day = d.getDate();
		return d.getFullYear() === now.getFullYear() ? `${month} ${day}` : `${month} ${day}, ${d.getFullYear()}`;
	}
</script>

<svelte:head>
	<title>{lead.business_name} — LeadGen</title>
</svelte:head>

<main>
	<div class="back-row">
		<button class="back-btn" onclick={() => goto('/')}>← Back</button>
		<div class="back-actions">
			{#if enrichMsg}<span class="save-msg">{enrichMsg}</span>{/if}
			<button class="enrich-btn" onclick={handleEnrich} disabled={enriching}>
				{enriching ? 'Enriching… (30s)' : 'Enrich Lead'}
			</button>
			{#if lead.email}
				<button class="email-btn" onclick={openEmailModal}>Send Email</button>
			{/if}
			<button
				class="delete-btn"
				class:confirm={confirmDelete}
				onclick={handleDelete}
				disabled={deleting}
			>
				{deleting ? 'Deleting…' : confirmDelete ? 'Confirm delete?' : 'Delete lead'}
			</button>
		</div>
	</div>

	<div class="lead-header">
		<div>
			<h1>{lead.business_name}</h1>
			<p class="address">{lead.address}</p>
		</div>
		<div class="score-pill" style="color: {scoreColor(lead.lead_score)}">
			{lead.lead_score ?? '—'}
		</div>
	</div>

	<div class="grid">
		<!-- Status -->
		<section class="card">
			<h2>Status</h2>
			<div class="field">
				<select value={lead.status} onchange={changeStatus}>
					{#each STATUSES as s}
						<option value={s}>{s}</option>
					{/each}
				</select>
			</div>
		</section>

		<!-- Contact -->
		<section class="card">
			<h2>Contact</h2>
			<dl>
				<dt>Phone</dt>
				<dd>{fmt(lead.phone)}</dd>
				{#if lead.email}
					<dt>Email</dt>
					<dd><a href={`mailto:${lead.email}`} class="contact-link">{lead.email}</a></dd>
				{/if}
				<dt>Website</dt>
				<dd>
					{#if lead.website_url}
						<a href={lead.website_url} target="_blank" rel="noopener noreferrer" class="contact-link">
							{lead.website_url}
						</a>
						{#if lead.website_inferred}
							<span class="inferred-warn">Not on Google profile — may be inaccurate</span>
						{/if}
					{:else}
						—
					{/if}
				</dd>
				<dt>Google Maps</dt>
				<dd>
					<a
						href={`https://www.google.com/maps/place/?q=place_id:${lead.google_place_id}`}
						target="_blank"
						rel="noopener noreferrer"
						class="contact-link"
					>View on Google Maps →</a>
				</dd>
				{#if lead.yelp_url}
					<dt>Yelp</dt>
					<dd>
						<a href={lead.yelp_url} target="_blank" rel="noopener noreferrer" class="contact-link">View on Yelp</a>
					</dd>
				{/if}
			</dl>
		</section>

		<!-- Google -->
		<section class="card">
			<h2>Google Presence</h2>
			<dl>
				<dt>Rating</dt>
				<dd>{lead.google_rating ?? '—'} ⭐ ({lead.review_count} reviews)</dd>
				<dt>Has GBP</dt>
				<dd>{fmt(lead.has_gbp)}</dd>
				<dt>Place ID</dt>
				<dd class="mono">{lead.google_place_id}</dd>
			</dl>
		</section>

		<!-- Web Health -->
		<section class="card">
			<h2>Web Health</h2>
			{#if lead.website_screenshot}
				<img src={lead.website_screenshot} alt="Website screenshot" class="screenshot-thumb" />
			{/if}
			<dl>
				<dt>Has Website</dt>
				<dd>{fmt(lead.has_website)}</dd>
				<dt>HTTPS</dt>
				<dd>{fmt(lead.has_https)}</dd>
				<dt>Mobile Friendly</dt>
				<dd class:yes={lead.mobile_friendly === true} class:no={lead.mobile_friendly === false}>
					{lead.mobile_friendly === true ? 'Yes' : lead.mobile_friendly === false ? 'No' : '—'}
				</dd>
				<dt>PageSpeed Mobile</dt>
				<dd style="color: {psColor(lead.pagespeed_mobile)}">
					{lead.pagespeed_mobile ?? '—'}
				</dd>
				<dt>PageSpeed Desktop</dt>
				<dd style="color: {psColor(lead.pagespeed_desktop)}">
					{lead.pagespeed_desktop ?? '—'}
				</dd>
				<dt>SEO Score</dt>
				<dd style="color: {psColor(lead.pagespeed_seo)}">
					{lead.pagespeed_seo ?? '—'}
				</dd>
				<dt>Best Practices</dt>
				<dd style="color: {psColor(lead.pagespeed_best_practices)}">
					{lead.pagespeed_best_practices ?? '—'}
				</dd>
				<dt>Site Age Estimate</dt>
				<dd>{fmt(lead.site_age_estimate)}</dd>
				<dt>Also on Yelp</dt>
				<dd>{fmt(lead.also_on_yelp)}</dd>
			</dl>
		</section>

		<!-- Scoring -->
		<section class="card">
			<h2>Lead Score</h2>
			<dl>
				<dt>Score</dt>
				<dd class="mono" style="color: {scoreColor(lead.lead_score)}; font-size: 1.5rem;">
					{lead.lead_score ?? '—'}
				</dd>
				<dt>Priority</dt>
				<dd>{fmt(lead.priority)}</dd>
			</dl>
		</section>

		<!-- Meta -->
		<section class="card">
			<h2>Metadata</h2>
			<dl>
				<dt>Created</dt>
				<dd>{lead.created_at ? new Date(lead.created_at).toLocaleString() : '—'}</dd>
				<dt>Last Updated</dt>
				<dd>{lead.last_updated ? new Date(lead.last_updated).toLocaleString() : '—'}</dd>
			</dl>
		</section>
	</div>

	<!-- Notes -->
	<section class="card notes-card">
		<h2>Notes</h2>
		<textarea bind:value={notes} rows="6" placeholder="Add notes about this lead..."></textarea>
		<div class="notes-footer">
			{#if saveMsg}<span class="save-msg">{saveMsg}</span>{/if}
			<button class="save-btn" onclick={saveNotes} disabled={saving}>
				{saving ? 'Saving…' : 'Save Notes'}
			</button>
		</div>
	</section>

	<!-- Activity Log -->
	<section class="card activity-card">
		<h2>Activity</h2>

		<form
			method="POST"
			action="?/log_activity"
			use:enhance={() => {
				activitySubmitting = true;
				return async ({ update }) => {
					await update();
					activitySubmitting = false;
				};
			}}
			class="activity-form"
		>
			<div class="type-group">
				{#each [['call', 'Call'], ['email', 'Email'], ['visit', 'Visit'], ['note', 'Note']] as [val, label]}
					<button
						type="button"
						class="type-btn"
						class:active={activityType === val}
						onclick={() => (activityType = val as typeof activityType)}
					>{label}</button>
				{/each}
			</div>
			<input type="hidden" name="type" value={activityType} />
			<textarea
				name="notes"
				rows="2"
				placeholder="Notes{activityType === 'note' ? ' (required)' : ' (optional)'}…"
				required={activityType === 'note'}
				class="activity-notes"
			></textarea>
			<button type="submit" class="log-btn" disabled={activitySubmitting}>
				{activitySubmitting ? 'Logging…' : 'Log'}
			</button>
		</form>

		{#if !data.events || data.events.length === 0}
			<p class="empty-state">No activity logged yet.</p>
		{:else}
			<ul class="event-list">
				{#each data.events as ev}
					<li class="event-item" data-type={ev.type}>
						<span class="event-badge" data-type={ev.type}>{ev.type}</span>
						<span class="event-body">
							{#if ev.notes}<span class="event-notes">{ev.notes}</span>{/if}
						</span>
						<span class="event-date">{fmtEventDate(ev.created_at)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

{#if emailModalOpen}
	<div
		class="modal-backdrop"
		onclick={() => (emailModalOpen = false)}
		role="presentation"
		onkeydown={(e) => e.key === 'Escape' && (emailModalOpen = false)}
	>
		<div
			class="modal"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-label="Compose Email"
			tabindex="-1"
		>
			<div class="modal-header">
				<h2>Send Email to {lead.business_name}</h2>
				<button class="modal-close" onclick={() => (emailModalOpen = false)} aria-label="Close">✕</button>
			</div>

			<div class="modal-body">
				<div class="form-row">
					<span class="field-label">To</span>
					<div class="static-field">{lead.email}</div>
				</div>

				<div class="form-row">
					<label for="sender-name">Your Name</label>
					<input
						id="sender-name"
						type="text"
						bind:value={senderName}
						placeholder="e.g. Liam Nicholson"
						onchange={onTemplateChange}
					/>
				</div>

				<div class="form-row">
					<label for="template-select">Template</label>
					<select id="template-select" bind:value={selectedTemplate} onchange={onTemplateChange}>
						{#each EMAIL_TEMPLATES as tmpl}
							<option value={tmpl}>{tmpl.label}</option>
						{/each}
					</select>
				</div>

				<div class="form-row">
					<label for="extra-context">Context for AI <span class="optional">(optional)</span></label>
					<input
						id="extra-context"
						type="text"
						bind:value={extraContext}
						placeholder="e.g. they have 50 reviews but no website in rural Montana"
					/>
				</div>

				<div class="ai-row">
					<button class="generate-btn" onclick={handleGenerate} disabled={generating}>
						{generating ? 'Generating…' : '✦ Generate with AI'}
					</button>
					{#if generateError}
						<span class="error-msg">{generateError} — you can still edit manually below.</span>
					{/if}
				</div>

				<div class="form-row">
					<label for="email-subject">Subject</label>
					<input id="email-subject" type="text" bind:value={emailSubject} />
				</div>

				<div class="form-row">
					<label for="email-body">Body</label>
					<textarea id="email-body" bind:value={emailBody} rows="10"></textarea>
				</div>

				{#if lead.status === 'cold'}
					<div class="form-row checkbox-row">
						<label>
							<input type="checkbox" bind:checked={markContacted} />
							Mark lead as "contacted" after sending
						</label>
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				{#if sendSuccess}
					<span class="save-msg">Email sent!</span>
				{/if}
				{#if sendError}
					<span class="error-msg">{sendError}</span>
				{/if}
				<button class="cancel-btn" onclick={() => (emailModalOpen = false)} disabled={sending}>
					Cancel
				</button>
				<button
					class="save-btn"
					onclick={handleSendEmail}
					disabled={sending || !emailSubject.trim() || !emailBody.trim()}
				>
					{sending ? 'Sending…' : 'Send Email'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	main {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	.back-btn {
		background: transparent;
		border: none;
		color: #7c3aed;
		cursor: pointer;
		font-size: 0.875rem;
		padding: 0;
		margin-bottom: 1.5rem;
		display: block;
	}

	.back-btn:hover {
		color: #d946ef;
	}

	.lead-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2rem;
		gap: 1rem;
	}

	h1 {
		font-size: 1.6rem;
		color: #f1f5f9;
		margin-bottom: 0.25rem;
	}

	.address {
		color: #64748b;
		font-size: 0.9rem;
	}

	.score-pill {
		font-family: 'JetBrains Mono', monospace;
		font-size: 2.5rem;
		font-weight: 700;
		line-height: 1;
		min-width: 80px;
		text-align: right;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.card {
		background: #10101a;
		border: 1px solid #1a1a2e;
		border-radius: 10px;
		padding: 1.25rem;
	}

	h2 {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: #64748b;
		margin-bottom: 0.85rem;
	}

	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3rem 1rem;
		font-size: 0.875rem;
	}

	dt {
		color: #64748b;
		white-space: nowrap;
	}

	dd {
		color: #e2e8f0;
		word-break: break-all;
	}

	.mono {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
	}

	.field select {
		background: #13131f;
		border: 1px solid #2a2a3e;
		color: #e2e8f0;
		padding: 0.4rem 0.7rem;
		border-radius: 6px;
		cursor: pointer;
		outline: none;
		width: 100%;
	}

	.field select:focus {
		border-color: #7c3aed;
	}

	.notes-card {
		margin-top: 0;
	}

	textarea {
		width: 100%;
		background: #13131f;
		border: 1px solid #2a2a3e;
		color: #e2e8f0;
		padding: 0.75rem;
		border-radius: 6px;
		resize: vertical;
		outline: none;
		line-height: 1.6;
	}

	textarea:focus {
		border-color: #7c3aed;
	}

	.notes-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 1rem;
		margin-top: 0.75rem;
	}

	.save-msg {
		font-size: 0.8rem;
		color: #4ade80;
	}

	.save-btn {
		background: #7c3aed;
		border: none;
		color: #fff;
		padding: 0.45rem 1.1rem;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 500;
		font-size: 0.875rem;
		transition: background 0.15s;
	}

	.save-btn:hover:not(:disabled) {
		background: #6d28d9;
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.back-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.back-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.enrich-btn {
		background: #7c3aed;
		border: none;
		color: #fff;
		padding: 0.35rem 0.85rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 500;
		transition: background 0.15s;
	}

	.enrich-btn:hover:not(:disabled) {
		background: #6d28d9;
	}

	.enrich-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.delete-btn {
		background: transparent;
		border: 1px solid #3d1a1a;
		color: #f87171;
		padding: 0.35rem 0.85rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		transition: background 0.15s, border-color 0.15s;
	}

	.delete-btn:hover:not(:disabled) {
		background: #2a1a1a;
		border-color: #f87171;
	}

	.delete-btn.confirm {
		background: #7f1d1d;
		border-color: #f87171;
		color: #fff;
	}

	.delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.screenshot-thumb {
		width: 100%;
		border-radius: 6px;
		margin-bottom: 1rem;
		border: 1px solid #2a2a3e;
		display: block;
	}

	.yes {
		color: #4ade80;
	}

	.no {
		color: #f87171;
	}

	.contact-link {
		color: #7c3aed;
		word-break: break-all;
	}

	.contact-link:hover {
		color: #d946ef;
	}

	.inferred-warn {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.75rem;
		color: #fbbf24;
		background: #78350f22;
		border: 1px solid #78350f;
		border-radius: 4px;
		padding: 0.2rem 0.5rem;
	}

	.email-btn {
		background: #0f4c75;
		border: none;
		color: #e2e8f0;
		padding: 0.35rem 0.85rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 500;
		transition: background 0.15s;
	}

	.email-btn:hover {
		background: #1a6fa8;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.modal {
		background: #10101a;
		border: 1px solid #2a2a3e;
		border-radius: 12px;
		width: 100%;
		max-width: 640px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		box-shadow: 0 25px 50px rgba(0, 0, 0, 0.6);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid #1a1a2e;
	}

	.modal-header h2 {
		font-size: 0.85rem;
		color: #94a3b8;
		text-transform: none;
		letter-spacing: 0;
		margin: 0;
	}

	.modal-close {
		background: none;
		border: none;
		color: #64748b;
		cursor: pointer;
		font-size: 1rem;
		line-height: 1;
		padding: 0.25rem;
	}

	.modal-close:hover {
		color: #e2e8f0;
	}

	.modal-body {
		padding: 1.25rem 1.5rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		flex: 1;
	}

	.form-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.form-row label,
	.field-label {
		font-size: 0.75rem;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.optional {
		text-transform: none;
		letter-spacing: 0;
		color: #475569;
	}

	.form-row input[type='text'],
	.form-row select,
	.form-row textarea {
		background: #13131f;
		border: 1px solid #2a2a3e;
		color: #e2e8f0;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		outline: none;
		width: 100%;
		font-family: inherit;
		font-size: 0.875rem;
	}

	.form-row input[type='text']:focus,
	.form-row select:focus,
	.form-row textarea:focus {
		border-color: #7c3aed;
	}

	.form-row textarea {
		resize: vertical;
		line-height: 1.6;
	}

	.static-field {
		font-size: 0.875rem;
		color: #7c3aed;
		padding: 0.3rem 0;
	}

	.checkbox-row label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: #94a3b8;
		text-transform: none;
		letter-spacing: 0;
		cursor: pointer;
	}

	.ai-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.generate-btn {
		background: #312e81;
		border: 1px solid #4338ca;
		color: #c7d2fe;
		padding: 0.4rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 500;
		transition: background 0.15s;
		white-space: nowrap;
	}

	.generate-btn:hover:not(:disabled) {
		background: #3730a3;
	}

	.generate-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.modal-footer {
		padding: 1rem 1.5rem;
		border-top: 1px solid #1a1a2e;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.cancel-btn {
		background: transparent;
		border: 1px solid #2a2a3e;
		color: #94a3b8;
		padding: 0.45rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
	}

	.cancel-btn:hover:not(:disabled) {
		border-color: #4a5568;
		color: #e2e8f0;
	}

	.cancel-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.error-msg {
		font-size: 0.8rem;
		color: #f87171;
		flex: 1;
	}

	/* Activity Log */
	.activity-card {
		margin-top: 1.5rem;
	}

	.activity-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.type-group {
		display: flex;
		gap: 0.375rem;
	}

	.type-btn {
		background: #10101a;
		border: 1px solid #2a2a3e;
		color: #94a3b8;
		padding: 0.35rem 0.85rem;
		border-radius: 6px;
		font-size: 0.8rem;
		cursor: pointer;
		font-family: inherit;
		transition: border-color 0.15s, color 0.15s;
	}

	.type-btn:hover {
		border-color: #4a4a6e;
		color: #e2e8f0;
	}

	.type-btn.active {
		border-color: #7c3aed;
		color: #f1f5f9;
		background: rgba(124, 58, 237, 0.12);
	}

	.activity-notes {
		background: #13131f;
		border: 1px solid #2a2a3e;
		border-radius: 6px;
		color: #e2e8f0;
		font-family: inherit;
		font-size: 0.875rem;
		padding: 0.5rem 0.75rem;
		resize: vertical;
		width: 100%;
		box-sizing: border-box;
	}

	.activity-notes:focus {
		outline: none;
		border-color: #7c3aed;
	}

	.log-btn {
		align-self: flex-end;
		background: #7c3aed;
		border: none;
		border-radius: 6px;
		color: #fff;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.875rem;
		padding: 0.45rem 1.25rem;
	}

	.log-btn:hover:not(:disabled) {
		background: #6d28d9;
	}

	.log-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty-state {
		color: #64748b;
		font-size: 0.875rem;
		font-style: italic;
		margin: 0;
	}

	.event-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.event-item {
		display: flex;
		align-items: baseline;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		border-left: 3px solid;
		background: #10101a;
		font-size: 0.875rem;
	}

	.event-item[data-type='email'] { border-left-color: #60a5fa; }
	.event-item[data-type='call']  { border-left-color: #4ade80; }
	.event-item[data-type='visit'] { border-left-color: #fbbf24; }
	.event-item[data-type='note']  { border-left-color: #7c3aed; }

	.event-badge {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.event-badge[data-type='email'] { background: rgba(96,165,250,0.15); color: #60a5fa; }
	.event-badge[data-type='call']  { background: rgba(74,222,128,0.15); color: #4ade80; }
	.event-badge[data-type='visit'] { background: rgba(251,191,36,0.15);  color: #fbbf24; }
	.event-badge[data-type='note']  { background: rgba(124,58,237,0.15);  color: #a78bfa; }

	.event-body {
		flex: 1;
		color: #e2e8f0;
	}

	.event-notes {
		color: #cbd5e1;
	}

	.event-date {
		color: #64748b;
		font-size: 0.775rem;
		flex-shrink: 0;
	}

</style>
