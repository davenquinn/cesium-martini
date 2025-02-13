/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAPBOX_API_TOKEN: string;
  // Add other env variables here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
