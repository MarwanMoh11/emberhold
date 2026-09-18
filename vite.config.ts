import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, so the built asset URLs
  // need that prefix. A dev server sits at the root, hence the mode split.
  base: process.env.NODE_ENV === 'production' ? '/emberhold/' : '/',
  server: { host: true, port: 5180 },
  build: { target: 'es2021', chunkSizeWarningLimit: 2000 },
})
