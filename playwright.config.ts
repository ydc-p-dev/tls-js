import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Завантажити конфігурацію сайтів
const configPath = path.join(__dirname, 'site-config', 'config.json');
let config: any = {};

try {
  const configData = fs.readFileSync(configPath, 'utf8');
  config = JSON.parse(configData);
} catch (err) {
  console.error('❌ Failed to load site-config/config.json');
}

// Отримати домен з environment variable
const targetDomain = process.env.TARGET_DOMAIN;

// Функція для витягування домену і порту з URL
function extractHostPort(url: string): { host: string; port: number } {
  try {
    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const port = urlObj.port ? parseInt(urlObj.port) : (urlObj.protocol === 'https:' ? 443 : 80);
    return { host, port };
  } catch (err) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

// Отримати конфігурацію для домену
let proxyTarget = 'example.com:443'; // дефолт
let wsProxyCommand = '';
const bindAddress = process.env.WS_BIND_ADDR || '0.0.0.0:55688';

if (targetDomain && config.sites && config.sites[targetDomain]) {
  const siteConfig = config.sites[targetDomain];
  const { host, port } = extractHostPort(siteConfig.applyCouponUrl);
  proxyTarget = `${host}:${port}`;
  wsProxyCommand = `wstcp --bind-addr ${bindAddress} ${proxyTarget}`;

  console.log('🌐 WebSocket Proxy will connect to:', proxyTarget);
} else if (targetDomain) {
  // Якщо домен вказаний, але немає в конфігу - використати його напряму
  proxyTarget = `${targetDomain}:443`;
  wsProxyCommand = `wstcp --bind-addr ${bindAddress} ${proxyTarget}`;

  console.log('⚠️  Domain not in config, using:', proxyTarget);
}

export default defineConfig({
  testDir: './playwright-test',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',

  timeout: 180000, // 3 хвилини

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  webServer: [
    // {
    //   command: 'npm run build:test && npm run serve:test',
    //   url: 'http://localhost:3001',
    //   reuseExistingServer: !process.env.CI,
    //   timeout: 120000,
    // },
    {
      // Сервер НЕ запускається через webServer в Docker
      // Він вже запущений через docker-entrypoint.sh
      command: 'echo "Server already running in Docker"',
      url: 'http://localhost:3001',
      reuseExistingServer: true,
      timeout: 5000,
    },
    // 🎯 Динамічний WebSocket Proxy
    ...(wsProxyCommand ? [{
      command: wsProxyCommand,
      reuseExistingServer: true,
      timeout: 10000,
    }] : []),
  ]
});







// import { defineConfig, devices } from '@playwright/test';
//
// export default defineConfig({
//   testDir: './playwright-test',
//   fullyParallel: false,
//   forbidOnly: !!process.env.CI,
//   retries: process.env.CI ? 2 : 0,
//   workers: 1,
//   reporter: 'html',
//
//   timeout: 240000,
//
//   use: {
//     baseURL: 'http://localhost:3001',
//     trace: 'on-first-retry',
//     video: 'retain-on-failure',
//     screenshot: 'only-on-failure',
//   },
//
//   projects: [
//     {
//       name: 'chromium',
//       use: {
//         ...devices['Desktop Chrome'],
//         // Uncomment для дебагу
//         // headless: false,
//         // launchOptions: {
//         //   slowMo: 1000,
//         // }
//       },
//     },
//   ],
//
//   webServer: [
//     {
//       command: 'npm run build:test && npm run serve:test',
//       url: 'http://localhost:3001',
//       reuseExistingServer: !process.env.CI,
//       timeout: 120000,
//     },
//     {
//       command: 'wstcp --bind-addr 127.0.0.1:55688 myprotein.ro:443',
//       reuseExistingServer: true,
//     },
//   ]
// });












// import { defineConfig, devices } from '@playwright/test';
//
// /**
//  * Read environment variables from file.
//  * https://github.com/motdotla/dotenv
//  */
// // import dotenv from 'dotenv';
// // import path from 'path';
// // dotenv.config({ path: path.resolve(__dirname, '.env') });
//
// /**
//  * See https://playwright.dev/docs/test-configuration.
//  */
// export default defineConfig({
//   testDir: './test/new',
//   /* Run tests in files in parallel */
//   fullyParallel: true,
//   /* Fail the build on CI if you accidentally left test.only in the source code. */
//   forbidOnly: !!process.env.CI,
//   /* Retry on CI only */
//   retries: process.env.CI ? 2 : 0,
//   /* Opt out of parallel tests on CI. */
//   workers: process.env.CI ? 1 : undefined,
//   /* Reporter to use. See https://playwright.dev/docs/test-reporters */
//   reporter: 'html',
//   /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
//   use: {
//     /* Base URL to use in actions like `await page.goto('/')`. */
//     baseURL: 'http://localhost:3001',
//
//     /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
//     trace: 'on-first-retry',
//   },
//
//   /* Configure projects for major browsers */
//   projects: [
//     {
//       name: 'chromium',
//       use: { ...devices['Desktop Chrome'] },
//     },
//
//     // {
//     //   name: 'firefox',
//     //   use: { ...devices['Desktop Firefox'] },
//     // },
//
//     // {
//     //   name: 'webkit',
//     //   use: { ...devices['Desktop Safari'] },
//     // },
//
//     /* Test against mobile viewports. */
//     // {
//     //   name: 'Mobile Chrome',
//     //   use: { ...devices['Pixel 5'] },
//     // },
//     // {
//     //   name: 'Mobile Safari',
//     //   use: { ...devices['iPhone 12'] },
//     // },
//
//     /* Test against branded browsers. */
//     // {
//     //   name: 'Microsoft Edge',
//     //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
//     // },
//     // {
//     //   name: 'Google Chrome',
//     //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
//     // },
//   ],
//
//   /* Run your local dev server before starting the tests */
//   webServer: [
//     {
//       command: 'npm run build:test && npm run serve:test',
//       url: 'http://localhost:3001',
//       reuseExistingServer: !process.env.CI,
//     },
//     {
//       command: 'wstcp --bind-addr 127.0.0.1:55688 modaoperandi.com:443',
//       reuseExistingServer: true,
//     },
//   ]
// });
