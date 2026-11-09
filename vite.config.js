import { defineConfig } from 'vite'

export default defineConfig({
  base: '/chess/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  publicDir: 'public',
})
