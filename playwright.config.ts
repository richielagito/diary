import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:4173'
/** The default build, without a sync server. Used by e2e/no-sync.spec.ts. */
const noSyncURL = 'http://localhost:4174'

// Both builds go to their own directories, so a test run never touches `dist/`, the directory that gets deployed.
const serve = (outDir: string, port: number) =>
  `npm run build -- --outDir ${outDir} && npm run preview -- --outDir ${outDir} --port ${port} --strictPort`

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL, locale: 'id-ID', timezoneId: 'Asia/Jakarta' },
  webServer: [
    {
      command: serve('dist-e2e', 4173),
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: { VITE_API_URL: 'https://sync.test' },
    },
    {
      command: serve('dist-e2e-nosync', 4174),
      url: noSyncURL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      // Empty on purpose: a variable set here wins over a local .env file, so this build never has a server.
      env: { VITE_API_URL: '' },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
