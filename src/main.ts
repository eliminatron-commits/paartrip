import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { initUpdates } from './lib/update.svelte.ts';

mount(App, { target: document.getElementById('app')! });
void initUpdates();
