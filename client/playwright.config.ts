import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '../tests/browser',
  outputDir: '../tmp/client-browser-results',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], channel: 'chrome', baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
})
