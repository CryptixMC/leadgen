<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Chart,
		CategoryScale,
		LinearScale,
		PointElement,
		LineElement,
		BarElement,
		Tooltip,
		Legend
	} from 'chart.js';

	Chart.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

	let { data } = $props();

	const TEXT = '#e2e8f0';
	const GRID = '#1a1a2e';
	const ACCENT = '#7c3aed';
	const ACCENT_BAR = 'rgba(124, 58, 237, 0.8)';

	function monthLabel(ym: string): string {
		const [y, m] = ym.split('-');
		const d = new Date(Number(y), Number(m) - 1, 1);
		return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
	}

	const baseScales = {
		x: {
			ticks: { color: TEXT, font: { family: "'DM Sans', sans-serif", size: 11 } },
			grid: { color: GRID }
		},
		y: {
			ticks: { color: TEXT, font: { family: "'DM Sans', sans-serif", size: 11 } },
			grid: { color: GRID }
		}
	};

	const baseLegend = { labels: { color: TEXT } };

	// MRR line chart
	let mrrCanvas: HTMLCanvasElement = $state()!;
	let mrrChart: Chart | null = null;

	// Pipeline bar chart
	let funnelCanvas: HTMLCanvasElement = $state()!;
	let funnelChart: Chart | null = null;

	// Revenue bar chart
	let revCanvas: HTMLCanvasElement = $state()!;
	let revChart: Chart | null = null;

	onMount(() => {
		if (data.mrrOverTime.length > 0) {
			mrrChart = new Chart(mrrCanvas, {
				type: 'line',
				data: {
					labels: data.mrrOverTime.map((d: { month: string }) => monthLabel(d.month)),
					datasets: [
						{
							label: 'Cumulative MRR',
							data: data.mrrOverTime.map((d: { mrr: number }) => d.mrr),
							borderColor: ACCENT,
							backgroundColor: 'transparent',
							pointBackgroundColor: ACCENT,
							tension: 0.3
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: { legend: baseLegend },
					scales: {
						...baseScales,
						y: {
							...baseScales.y,
							ticks: {
								...baseScales.y.ticks,
								callback: (v) => '$' + Number(v).toLocaleString()
							}
						}
					}
				}
			});
		}

		if (data.pipelineFunnel.length > 0) {
			funnelChart = new Chart(funnelCanvas, {
				type: 'bar',
				data: {
					labels: data.pipelineFunnel.map((d: { status: string }) =>
						d.status.replace('_', ' ')
					),
					datasets: [
						{
							label: 'Leads',
							data: data.pipelineFunnel.map((d: { count: number }) => d.count),
							backgroundColor: ACCENT_BAR,
							borderColor: ACCENT,
							borderWidth: 1
						}
					]
				},
				options: {
					indexAxis: 'y',
					responsive: true,
					maintainAspectRatio: false,
					plugins: { legend: baseLegend },
					scales: {
						...baseScales,
						x: {
							...baseScales.x,
							ticks: {
								...baseScales.x.ticks,
								stepSize: 1
							}
						}
					}
				}
			});
		}

		if (data.revenueByMonth.length > 0) {
			revChart = new Chart(revCanvas, {
				type: 'bar',
				data: {
					labels: data.revenueByMonth.map((d: { month: string }) => monthLabel(d.month)),
					datasets: [
						{
							label: 'Revenue',
							data: data.revenueByMonth.map((d: { revenue: number }) => d.revenue),
							backgroundColor: ACCENT_BAR,
							borderColor: ACCENT,
							borderWidth: 1
						}
					]
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					plugins: { legend: baseLegend },
					scales: {
						...baseScales,
						y: {
							...baseScales.y,
							ticks: {
								...baseScales.y.ticks,
								callback: (v) => '$' + Number(v).toLocaleString()
							}
						}
					}
				}
			});
		}
	});

	onDestroy(() => {
		mrrChart?.destroy();
		funnelChart?.destroy();
		revChart?.destroy();
	});
</script>

<main>
	<h1>Analytics</h1>

	<section class="chart-section">
		<h2>MRR over time</h2>
		{#if data.mrrOverTime.length === 0}
			<p class="empty">No data yet</p>
		{:else}
			<div class="chart-wrap">
				<canvas bind:this={mrrCanvas}></canvas>
			</div>
		{/if}
	</section>

	<section class="chart-section">
		<h2>Pipeline funnel</h2>
		{#if data.pipelineFunnel.length === 0}
			<p class="empty">No data yet</p>
		{:else}
			<div class="chart-wrap">
				<canvas bind:this={funnelCanvas}></canvas>
			</div>
		{/if}
	</section>

	<section class="chart-section">
		<h2>Project revenue by month</h2>
		{#if data.revenueByMonth.length === 0}
			<p class="empty">No data yet</p>
		{:else}
			<div class="chart-wrap">
				<canvas bind:this={revCanvas}></canvas>
			</div>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #e2e8f0;
		margin-bottom: 0.5rem;
	}

	.chart-section {
		background: #10101a;
		border: 1px solid #1a1a2e;
		border-radius: 10px;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	h2 {
		font-size: 0.95rem;
		font-weight: 600;
		color: #94a3b8;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.chart-wrap {
		position: relative;
		height: 280px;
	}

	.empty {
		color: #4a5568;
		font-size: 0.9rem;
		padding: 3rem 0;
		text-align: center;
	}
</style>
