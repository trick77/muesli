import { defineConfig, devices } from '@playwright/test';

// WebKit is the engine that matters: Safari on iPad and iPhone.
// E2E_PORT lets parallel checkouts test side by side without sharing a server.
const port = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'ipad-landscape', use: { ...devices['iPad Pro 11 landscape'], browserName: 'webkit' } },
    { name: 'iphone-portrait', use: { ...devices['iPhone 15'], browserName: 'webkit' } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
