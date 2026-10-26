import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { templateCompilerOptions } from '@tresjs/core'

const proxy = {
  '/api/v1': {
    target: process.env.PARKING_API_TARGET ?? 'http://127.0.0.1:8080',
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [vue({ ...templateCompilerOptions })],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  build: { target: 'es2023' },
})
