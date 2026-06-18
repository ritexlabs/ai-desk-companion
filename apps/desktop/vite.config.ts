import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When running inside Tauri dev mode, TAURI_DEV_HOST is set to the device IP.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],

  // Vite clears terminal; disable to avoid hiding Tauri output
  clearScreen: false,

  server: {
    port: 5173,
    host: host || '0.0.0.0',
    strictPort: true,
    // Allow Tauri HMR from a different device/host
    hmr: host
      ? { protocol: 'ws', host, port: 5174 }
      : undefined,
    watch: {
      // Don't watch Rust source; that's Cargo's job
      ignored: ['**/src-tauri/**'],
    },
  },

  // Tauri targets; fallback to broad targets in plain browser mode
  envPrefix: ['VITE_', 'TAURI_ENV_*'],

  build: {
    // Use platform-specific targets when building inside Tauri
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
