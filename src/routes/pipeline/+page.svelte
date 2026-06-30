<script lang="ts">
	import type { PageData } from './$types';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	type CardLead = {
		id: string;
		business_name: string;
		address: string;
		phone: string;
		website_url: string | null;
		lead_score: number | null;
		priority: string | null;
		status: string;
		created_at: string | null;
	};

	const COLUMNS = [
		{ key: 'cold', label: 'Cold' },
		{ key: 'contacted', label: 'Contacted' },
		{ key: 'proposal', label: 'Proposal' },
		{ key: 'closed_won', label: 'Won' },
		{ key: 'closed_lost', label: 'Lost' }
	] as const;

	let columns = $state<Record<string, CardLead[]>>(
		Object.fromEntries(
			COLUMNS.map(({ key }) => [key, (data.columns[key] as CardLead[]) ?? []])
		)
	);

	let dragLeadId = $state<string | null>(null);
	let dragFromStatus = $state<string>('');
	let dragOverStatus = $state<string | null>(null);
	let draggingCardId = $state<string | null>(null);

	function handleDragStart(e: DragEvent, lead: CardLead) {
		dragLeadId = lead.id;
		dragFromStatus = lead.status;
		draggingCardId = lead.id;
		e.dataTransfer?.setData('text/plain', lead.id);
	}

	function handleDragEnd() {
		draggingCardId = null;
		dragLeadId = null;
		dragFromStatus = '';
		dragOverStatus = null;
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
	}

	function handleDragEnter(status: string) {
		dragOverStatus = status;
	}

	function handleDragLeave(e: DragEvent, colEl: HTMLElement) {
		if (!colEl.contains(e.relatedTarget as Node)) {
			dragOverStatus = null;
		}
	}

	async function handleDrop(toStatus: string) {
		dragOverStatus = null;
		if (!dragLeadId || toStatus === dragFromStatus) {
			draggingCardId = null;
			return;
		}

		const id = dragLeadId;
		const fromStatus = dragFromStatus;

		const fromCol = columns[fromStatus];
		const toCol = columns[toStatus];
		const idx = fromCol.findIndex((l) => l.id === id);
		if (idx === -1) return;

		const [lead] = fromCol.splice(idx, 1);
		columns[fromStatus] = [...fromCol];
		lead.status = toStatus;
		columns[toStatus] = [lead, ...toCol];

		draggingCardId = null;
		dragLeadId = null;
		dragFromStatus = '';

		const res = await fetch('/pipeline', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, status: toStatus })
		});

		if (!res.ok) {
			const currentToCol = columns[toStatus];
			const revertIdx = currentToCol.findIndex((l) => l.id === id);
			if (revertIdx !== -1) {
				const [reverted] = currentToCol.splice(revertIdx, 1);
				reverted.status = fromStatus;
				columns[toStatus] = [...currentToCol];
				columns[fromStatus] = [...columns[fromStatus], reverted];
			}
		}
	}

	function priorityDotColor(priority: string | null): string {
		if (priority === 'high') return '#D946EF';
		if (priority === 'medium') return '#818cf8';
		return '#9090B0';
	}

	function scoreColor(score: number | null): string {
		if (score == null) return 'var(--text-muted)';
		if (score >= 60) return 'var(--accent-highlight)';
		if (score >= 30) return '#818cf8';
		return 'var(--text-muted)';
	}
</script>

<svelte:head>
	<title>LeadGen — Pipeline</title>
</svelte:head>

<main>
	<div class="header">
		<h1>Pipeline</h1>
		<span class="count">{Object.values(columns).reduce((n, col) => n + col.length, 0)} leads</span>
	</div>

	<p class="swipe-hint">Swipe to see all stages →</p>

	<div class="board">
		{#each COLUMNS as col}
			{@const leads = columns[col.key]}
			<div
				class="column"
				class:drag-over={dragOverStatus === col.key}
				ondragover={handleDragOver}
				ondragenter={() => handleDragEnter(col.key)}
				ondragleave={(e) => handleDragLeave(e, e.currentTarget as HTMLElement)}
				ondrop={() => handleDrop(col.key)}
				role="region"
				aria-label={col.label}
			>
				<div class="col-header">
					<span class="col-label">{col.label}</span>
					<span class="col-count">{leads.length}</span>
				</div>

				<div class="col-body">
					{#each leads as lead (lead.id)}
						<div
							class="card"
							class:dragging={draggingCardId === lead.id}
							draggable="true"
							ondragstart={(e) => handleDragStart(e, lead)}
							ondragend={handleDragEnd}
							role="button"
							tabindex="0"
							aria-label={lead.business_name}
						>
							<div class="card-top">
								<a
									href="/leads/{lead.id}"
									class="card-name"
									onclick={(e) => e.stopPropagation()}
									ondragstart={(e) => e.preventDefault()}
								>{lead.business_name}</a>
								<span class="score-badge" style="color: {scoreColor(lead.lead_score)}">
									{lead.lead_score ?? '—'}
								</span>
							</div>
							<div class="card-meta">
								<span
									class="priority-dot"
									style="background: {priorityDotColor(lead.priority)}"
									title={lead.priority ?? 'unscored'}
								></span>
								{#if lead.phone}
									<span class="phone">{lead.phone}</span>
								{/if}
							</div>
						</div>
					{/each}

					{#if leads.length === 0}
						<div class="empty-col">No leads</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</main>

<style>
	main {
		padding: 2rem;
		max-width: 100%;
	}

	.header {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	h1 {
		font-size: 1.5rem;
		color: var(--text-primary);
	}

	.count {
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.board {
		display: flex;
		gap: 1rem;
		overflow-x: auto;
		align-items: flex-start;
		padding-bottom: 1rem;
	}

	.column {
		min-width: 260px;
		width: 260px;
		flex-shrink: 0;
		background: var(--bg-card);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		transition: border-color var(--dur-base);
	}

	.column.drag-over {
		border-color: var(--accent-primary);
		box-shadow: var(--glow-soft);
	}

	.col-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.03);
		border-bottom: 1px solid var(--border-grid);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
	}

	.col-label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.col-count {
		background: rgba(144, 144, 176, 0.12);
		color: var(--text-muted);
		font-family: var(--font-display);
		font-size: 0.72rem;
		font-weight: 600;
		padding: 0.15rem 0.5rem;
		border-radius: var(--radius-pill);
		min-width: 1.5rem;
		text-align: center;
	}

	.col-body {
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-height: 80px;
	}

	.card {
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: 0.75rem 1rem;
		cursor: grab;
		transition: border-color var(--dur-base), opacity var(--dur-fast), transform var(--dur-base);
		user-select: none;
	}

	.card:active {
		cursor: grabbing;
	}

	.card:hover {
		border-color: var(--border-accent);
		transform: translateY(-1px);
	}

	.card.dragging {
		opacity: 0.4;
	}

	.card-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.card-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
		line-height: 1.3;
		flex: 1;
		min-width: 0;
		text-decoration: none;
	}

	.card-name:hover {
		color: var(--accent-highlight);
	}

	.score-badge {
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.priority-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.phone {
		font-size: 0.78rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.empty-col {
		color: var(--text-muted);
		opacity: 0.4;
		font-size: 0.8rem;
		text-align: center;
		padding: 1rem 0;
	}

	.swipe-hint {
		display: none;
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-bottom: 0.75rem;
		opacity: 0.7;
	}

	@media (max-width: 768px) {
		main {
			padding: 1rem;
		}

		.swipe-hint {
			display: block;
		}

		.column {
			min-width: 230px;
			width: 230px;
		}

		.col-body {
			padding: 0.5rem;
		}

		.card {
			padding: 0.65rem 0.75rem;
		}
	}
</style>
