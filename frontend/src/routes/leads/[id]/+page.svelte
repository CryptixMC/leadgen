<script lang="ts">
	import { untrack } from 'svelte';
	import type { PageData } from './$types';
	import { updateLead, type Lead } from '$lib/api';
	import { supabase } from '$lib/supabase.js';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let lead = $state<Lead>(untrack(() => data.lead));
	let notes = $state(untrack(() => lead.notes ?? ''));
	let saving = $state(false);
	let saveMsg = $state('');

	const STATUSES = ['cold', 'contacted', 'proposal', 'closed_won', 'closed_lost'];

	async function getToken(): Promise<string | undefined> {
		const { data: { session } } = await supabase.auth.getSession();
		return session?.access_token;
	}

	async function changeStatus(e: Event) {
		const select = e.target as HTMLSelectElement;
		const newStatus = select.value;
		try {
			lead = await updateLead(lead.id, { status: newStatus }, await getToken());
			saveMsg = 'Status saved.';
		} catch {
			saveMsg = 'Failed to save status.';
		}
		setTimeout(() => (saveMsg = ''), 2000);
	}

	async function saveNotes() {
		saving = true;
		try {
			lead = await updateLead(lead.id, { notes }, await getToken());
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

	function scoreColor(s: number | null) {
		if (s === null) return '#64748b';
		if (s >= 60) return '#d946ef';
		if (s >= 30) return '#818cf8';
		return '#64748b';
	}
</script>

<svelte:head>
	<title>{lead.business_name} — LeadGen</title>
</svelte:head>

<main>
	<div class="back-row">
		<button class="back-btn" onclick={() => goto('/')}>← Back</button>
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
				<dt>Website</dt>
				<dd>
					{#if lead.website_url}
						<a href={lead.website_url} target="_blank" rel="noopener noreferrer">
							{lead.website_url}
						</a>
					{:else}
						—
					{/if}
				</dd>
				{#if lead.yelp_url}
					<dt>Yelp</dt>
					<dd>
						<a href={lead.yelp_url} target="_blank" rel="noopener noreferrer">View on Yelp</a>
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
			<dl>
				<dt>Has Website</dt>
				<dd>{fmt(lead.has_website)}</dd>
				<dt>HTTPS</dt>
				<dd>{fmt(lead.has_https)}</dd>
				<dt>Mobile Friendly</dt>
				<dd>{fmt(lead.mobile_friendly)}</dd>
				<dt>PageSpeed Mobile</dt>
				<dd>{fmt(lead.pagespeed_mobile)}</dd>
				<dt>PageSpeed Desktop</dt>
				<dd>{fmt(lead.pagespeed_desktop)}</dd>
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
</main>

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
		margin-bottom: 0.5rem;
	}
</style>
