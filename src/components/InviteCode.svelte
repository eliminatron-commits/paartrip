<script lang="ts">
  // Solange der zweite Spieler fehlt: der Kopplungscode zum Weitergeben.
  import { formatCode } from '../../shared/limits.ts';

  let { name, code }: { name: string; code: string | null } = $props();

  let copied = $state(false);

  async function copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(formatCode(value));
      copied = true;
    } catch {
      // Ohne Zwischenablage bleibt der Code zum Abtippen sichtbar.
    }
  }
</script>

<section class="panel" aria-labelledby="invite-title">
  <h2 id="invite-title" data-testid="house-names">The door is open, {name}</h2>
  {#if code}
    <p>Give this code to your partner. They choose "I have a code" on their phone.</p>
    <p class="code" data-testid="pairing-code">{formatCode(code)}</p>
    <div class="row">
      <button type="button" class="quiet" onclick={() => copy(code)}>{copied ? 'Copied' : 'Copy code'}</button>
    </div>
    <p class="note">The code works once. After your partner has moved in, the house is closed to everyone else.</p>
  {:else}
    <p>Waiting for the other half of this house.</p>
  {/if}
</section>

<style>
  .code {
    font-family: var(--font-title);
    font-size: 2.1rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--terracotta);
    font-variant-numeric: lining-nums;
  }
</style>
