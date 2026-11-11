/// <reference types="svelte" />
/// <reference types="vite/client" />

// Beim Build über Vite `define` eingesetzt (siehe vite.config.ts).
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
declare const __COMMIT__: string;

interface ImportMetaEnv {
  /** Adresse des Workers ohne Schrägstrich am Ende (.env.production, .env.development oder Umgebung). */
  readonly VITE_API_URL: string;
}
