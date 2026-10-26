import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { templateCompilerOptions } from '@tresjs/core'
import { fileURLToPath } from 'node:url'
export default defineConfig({
  root: fileURLToPath(new URL('./query', import.meta.url)),
  base: './',
  publicDir: process.env.PARKING_QUERY_PUBLIC_DIR ?? false,
  plugins: [vue({ ...templateCompilerOptions })],
  build: { target: 'es2023' },
})
