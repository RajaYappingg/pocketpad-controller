import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs so the embedded UI also works under a subpath /
  // reverse proxy, not just from server root.
  base: './',
  esbuild: {
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    jsxInject: `import { h, Fragment } from 'preact'`,
  },
  server: {
    // P1: backend also defaults to :3000 — use Vite's default so
    // `pnpm dev` (frontend) and `cargo run` (backend) run concurrently.
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
});
