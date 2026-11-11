<script lang="ts">
  // Erster Start: Vorname angeben und entweder das Haus anlegen oder mit dem Code des Partners einziehen.
  import { CODE_LENGTH, LIMITS, normalizeCode } from '../../shared/limits.ts';
  import { ApiFailure, type FailureCode } from '../lib/api.ts';
  import { createHouse, joinHouse, session } from '../lib/session.svelte.ts';
  import RestoreBackup from './RestoreBackup.svelte';

  let mode = $state<'start' | 'join'>('start');
  let name = $state('');
  let code = $state('');
  let busy = $state(false);
  let problem = $state('');

  const complete = $derived(name.trim().length > 0 && (mode === 'start' || normalizeCode(code).length === CODE_LENGTH));

  const PROBLEMS: Partial<Record<FailureCode, string>> = {
    offline: "No connection. Try again when you're online.",
    invalid_code: "That code doesn't open a house. Check it with your partner.",
    house_full: 'This house already has two people.',
    house_limit: "A new house can't be started right now.",
  };

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!complete || busy) return;
    busy = true;
    problem = '';
    try {
      if (mode === 'start') await createHouse(name.trim());
      else await joinHouse(code, name.trim());
    } catch (error) {
      if (!(error instanceof ApiFailure)) console.error(error);
      problem = (error instanceof ApiFailure && PROBLEMS[error.code]) || 'Something went wrong. Please try again.';
    } finally {
      busy = false;
    }
  }
</script>

<section class="panel" aria-labelledby="welcome-title">
  <h2 id="welcome-title">Welcome home</h2>
  <p>This little house is for exactly two people. One of you starts it, the other moves in with a code.</p>

  {#if session.storageFailed}
    <p class="problem">This browser can't store anything right now. Open the app from your Home Screen and try again.</p>
  {:else}
    <div class="row" role="group" aria-label="How do you want to begin?">
      <button type="button" class:quiet={mode !== 'start'} aria-pressed={mode === 'start'} onclick={() => (mode = 'start')}>Start our house</button>
      <button type="button" class:quiet={mode !== 'join'} aria-pressed={mode === 'join'} onclick={() => (mode = 'join')}>I have a code</button>
    </div>

    <form onsubmit={submit}>
      <label>
        Your first name
        <input bind:value={name} maxlength={LIMITS.nameLength} autocomplete="given-name" autocapitalize="words" enterkeyhint="done" />
      </label>
      {#if mode === 'join'}
        <label>
          Code from your partner
          <input bind:value={code} maxlength="12" placeholder="ABCD-2345" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" />
        </label>
      {/if}
      <button type="submit" disabled={!complete || busy}>{mode === 'start' ? 'Open the door' : 'Move in'}</button>
      <p class="problem" role="alert">{problem}</p>
    </form>

    <p class="note">Already part of a house and on a new phone?</p>
    <RestoreBackup />
  {/if}
</section>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  form button {
    align-self: flex-start;
  }

  .problem:empty {
    display: none;
  }
</style>
