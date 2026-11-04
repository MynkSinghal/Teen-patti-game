import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testDir: './story',
  testMatch: /.*\.spec\.ts/,
  timeout: 600_000,
  expect: { timeout: 25_000 },
  use: { ...base.use, ...devices['Pixel 7'], launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM, args: ['--no-sandbox'] } : {} },
});
