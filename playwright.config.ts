import { defineConfig, devices } from '@playwright/test'

/**
 * E2E runs against the app backed by MSW, so the role matrix and the import
 * flow are testable without a live GoGo-BE.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    env: { VITE_USE_MOCK: 'true' },
  },
})
