import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// // Завантажити конфігурацію сайтів
// const configPath = path.join(__dirname, 'site-config', 'actions.json');
// let config: any = {};

// let config;
//
// const customConfig = path.join(__dirname, 'output/temp', 'actions.json');
// const configPath = path.join(__dirname, 'site-config', 'actions.json');
//
// try {
//   config = JSON.parse(fs.readFileSync(customConfig ?? configPath, 'utf8'));
// } catch (err) {
//   console.error('❌ Failed to load actions.json');
//   console.error('Error:', err.message);
//   throw err;
// }

let config;

const customConfig = path.join(__dirname, 'output/temp', 'actions.json');
const configPath = path.join(__dirname, 'site-config', 'actions.json');
const isCustomConfig = fs.existsSync(customConfig);
const configToLoad = isCustomConfig ? customConfig : configPath;

try {
  config = JSON.parse(fs.readFileSync(configToLoad, 'utf8'));
  console.log(`✅ Loaded config from: ${configToLoad}`);
} catch (err) {
  console.error('❌ Failed to load config from:', configToLoad);
  console.error('Error:', err.message);
  throw err;
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
if (isCustomConfig || targetDomain && config.sites && config.sites[targetDomain] && config.sites[targetDomain].requestParams) {
  const siteConfig = isCustomConfig ? config : config?.sites[targetDomain];
  const { host, port } = extractHostPort(siteConfig?.requestParams?.applyCouponUrl);
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
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
      },
    },
  ],

  webServer: [
    {
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