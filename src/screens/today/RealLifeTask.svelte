<script lang="ts">
  // Aufgabe im echten Leben: Erledigt wird sie außerhalb der App. Hier steht, was zu tun ist, und der
  // Empfänger bestätigt den Erhalt – erst damit gilt sie als erledigt. Richtet sie sich an beide, bestätigen beide.
  import type { RealLifeTask } from '../../../shared/content-schema.ts';
  import { type ActiveTaskView, otherSlot, type Slot } from '../../../shared/model.ts';
  import { playSound } from '../../lib/audio.ts';
  import { dispatch, session } from '../../lib/session.svelte.ts';
  import { confirms, taskSent } from '../../lib/tasks.ts';

  let { task, spec, you, partner }: { task: ActiveTaskView; spec: RealLifeTask; you: Slot; partner: string } = $props();

  const confirmedBy = $derived(task.progress.type === 'reallife' ? task.progress.confirmedBy : []);
  const mine = $derived(confirms(spec, you));
  const confirmed = $derived(confirmedBy.includes(you));
  const sent = $derived(taskSent(session.queued, 'reallife.confirm', spec.id));

  async function confirm(): Promise<void> {
    playSound('solve');
    await dispatch({ type: 'reallife.confirm', taskId: spec.id });
  }
</script>

<section class="panel" aria-labelledby="task-title" data-testid="task" data-type="reallife">
  <p class="eyebrow">In real life</p>
  <h2 id="task-title">{spec.title}</h2>
  <p class="what">{spec.text}</p>

  {#if spec.doer === 'both'}
    <p class="note">This one is for both of you. Each of you confirms here once the other's part has arrived.</p>
  {:else if spec.doer === you}
    <p class="note">This one is yours to do. It counts once {partner} confirms that it arrived.</p>
  {:else}
    <p class="note">{partner} does this for you. Confirm here once it has arrived.</p>
  {/if}

  {#if confirmedBy.includes(otherSlot(you))}
    <p data-testid="partner-confirmed">{partner} has confirmed.</p>
  {/if}

  {#if mine}
    {#if confirmed}
      <p class="note" data-testid="task-waiting">You confirmed. Now {partner} has to confirm, too.</p>
    {:else if sent}
      <p class="note" data-testid="task-sent">Saved on this phone. It's on its way.</p>
    {:else}
      <div class="row">
        <button type="button" onclick={confirm}>It arrived</button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .what {
    font-size: 1.1rem;
  }
</style>
