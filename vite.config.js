import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5191, proxy: { '/world': { target: 'ws://127.0.0.1:5173', ws: true, rewriteWsOrigin: true } } },
  build: {
    // The three.js vendor chunk is about 500 kB on its own (it now includes skinning).
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
