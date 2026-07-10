import { defineConfig } from 'astro/config'

export default defineConfig({
  output: 'static',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    build: {
      target: 'es2022',
    },
  },
})
