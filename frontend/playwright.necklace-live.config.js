import { defineConfig } from '@playwright/test';
import production from './playwright.production.config.js';
export default defineConfig({
  ...production,
  testDir: 'tests/live',
  timeout: 120000,
  use: { ...production.use, baseURL: 'http://127.0.0.1:5175' },
  webServer: {
    ...production.webServer,
    command: 'npm run preview -- --port 5175 --strictPort',
    url: 'http://127.0.0.1:5175',
  },
});
