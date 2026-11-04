import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM, args: ['--no-sandbox'] } : {},
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        { command: 'node e2e/mock-auth.mjs', port: 54321, reuseExistingServer: true },
        {
          command: `npx next start -p ${PORT}`,
          port: PORT,
          reuseExistingServer: true,
          env: {
            NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon-key',
            SUPABASE_DB_URL: process.env.SUPABASE_DB_URL ?? 'postgres://postgres:postgres@localhost:5432/tp_test',
          },
        },
      ],
});
