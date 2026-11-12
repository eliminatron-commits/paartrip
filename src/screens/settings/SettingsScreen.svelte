<script lang="ts">
  // Einstellungen: Ton, Mitteilungen, Kopplungsstatus, Sichern und Wiederherstellen, Version und Updates.
  import AboutUpdates from '../../components/AboutUpdates.svelte';
  import DeviceSettings from '../../components/DeviceSettings.svelte';
  import { playSound } from '../../lib/audio.ts';
  import { session, updateSettings } from '../../lib/session.svelte.ts';

  async function toggleSound(): Promise<void> {
    const on = !session.settings.sound;
    await updateSettings({ sound: on });
    // Kostprobe, damit zu hören ist, was eingeschaltet wurde.
    if (on) playSound('place');
  }
</script>

<div class="page">
  <h2>Settings</h2>

  {#if !session.storageFailed && session.status !== 'loading'}
    <section class="panel" aria-labelledby="sound-title">
      <h2 id="sound-title">Sound</h2>
      <div class="setting">
        <p id="sound-text">Soft sounds when you place a piece, finish a task or open a gift.</p>
        <button type="button" class="plain switch" role="switch" aria-checked={session.settings.sound} aria-labelledby="sound-title" aria-describedby="sound-text" onclick={toggleSound}>
          <span class="track"><span class="knob"></span></span>
          <span class="state">{session.settings.sound ? 'On' : 'Off'}</span>
        </button>
      </div>
    </section>
  {/if}

  {#if session.status === 'paired'}
    <DeviceSettings />
  {/if}

  <section class="panel" aria-labelledby="about-title">
    <h2 id="about-title">About</h2>
    <AboutUpdates />
  </section>
</div>

<style>
  .setting {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .setting p {
    flex: 1;
  }

  .switch {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 60px;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--ink);
  }

  .track {
    display: block;
    width: 52px;
    height: 30px;
    padding: 3px;
    border-radius: 999px;
    background: var(--ink-soft);
    transition: background-color 0.15s;
  }

  .knob {
    display: block;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--cream);
    transition: transform 0.15s;
  }

  .switch[aria-checked='true'] .track {
    background: var(--sage-deep);
  }

  .switch[aria-checked='true'] .knob {
    transform: translateX(22px);
  }
</style>
