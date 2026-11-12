import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { startSound } from './lib/audio.ts';
import { initPush } from './lib/push.svelte.ts';
import { initSession } from './lib/session.svelte.ts';
import { initUpdates } from './lib/update.svelte.ts';

mount(App, { target: document.getElementById('app')! });
startSound();
void initUpdates();
// Erst die lokale Kopie lesen (zeigt den letzten Stand auch ohne Netz), dann Push auffrischen.
void initSession().then(initPush);
