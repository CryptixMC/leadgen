<script lang="ts">
	import { demoMode, exitDemo } from '$lib/demo/state';

	let dismissed = $state(false);
</script>

{#if $demoMode && !dismissed}
	<div class="demo-banner">
		<span class="message">You're viewing a demo. Data is fictional and nothing is saved.</span>
		<div class="actions">
			<button class="sign-in" onclick={exitDemo}>Sign in →</button>
			<button class="dismiss" onclick={() => (dismissed = true)} aria-label="Dismiss">×</button>
		</div>
	</div>
{/if}

<style>
	.demo-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.55rem 2rem;
		background: rgba(124, 58, 237, 0.12);
		border-bottom: 1px solid var(--border-accent);
		gap: 1rem;
	}

	.message {
		font-family: var(--font-body);
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.sign-in {
		background: none;
		border: 1px solid var(--border-strong);
		color: var(--accent-highlight);
		padding: 0.25rem 0.75rem;
		border-radius: var(--radius-pill);
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 500;
		transition: border-color var(--dur-fast), color var(--dur-fast);
	}

	.sign-in:hover {
		border-color: var(--accent-highlight);
	}

	.dismiss {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		font-size: 1.1rem;
		line-height: 1;
		padding: 0.1rem 0.3rem;
		transition: color var(--dur-fast);
	}

	.dismiss:hover {
		color: var(--text-primary);
	}
</style>
