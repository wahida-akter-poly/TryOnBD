import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/production',
  timeout: 60000,
  expect: { timeout: 20000 },
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', headless: true, channel: 'msedge' },
  webServer: {
    command: 'npm run preview -- --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 120000,
  },
  reporter: 'list',
});
