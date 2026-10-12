/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_PUBLIC_BUILDER_KEY: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// `scorm-again` ships its own typings once installed; ScormPlayer.tsx
// lazy-loads it so the bundle doesn't pay the cost on every Studio
// surface. Until the dependency is added to package.json (gap-register
// "scorm-again npm dependency install"), declare a minimal shim so the
// dynamic import compiles without `--skipLibCheck`.
declare module "scorm-again" {
  export class Scorm12API {
    constructor(settings: Record<string, unknown>);
    cmi: Record<string, unknown>;
    loadFromJSON(cmi: Record<string, unknown>, prefix?: string): void;
    on(event: string, cb: (...args: unknown[]) => unknown): void;
  }
  export class Scorm2004API {
    constructor(settings: Record<string, unknown>);
    cmi: Record<string, unknown>;
    loadFromJSON(cmi: Record<string, unknown>, prefix?: string): void;
    on(event: string, cb: (...args: unknown[]) => unknown): void;
  }
}
