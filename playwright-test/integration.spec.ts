import { test, expect } from '@playwright/test';

const targetDomain = process.env.TARGET_DOMAIN;
const versionEnv = process.env.VERSION ?? '0.1.0-alpha.12';

console.log('Server Side');
test('integration', async ({ page }) => {

  console.log('🎯 Testing domain:', targetDomain);


  console.log('\n🎯 Running notarization for:', targetDomain);

  await page.addInitScript(domain => {
    window.__TARGET_DOMAIN__ = domain;
  }, targetDomain);

  // Логування для дебагу
  // page.on('console', msg => {
  //   const text = msg.text();
  //   // Фільтруємо шум
  //   if (!text.includes('DevTools') && !text.includes('Download')) {
  //     console.log('  [Browser]:', text);
  //   }
  // });
  //
  // page.on('pageerror', error => {
  //   console.error('  [Browser Error]:', error.message);
  // });

  const base = process.env.BASE_URL || 'http://localhost:3001'; // або порт твого сервера
  const fullUrl = `${base}/integration.html?domain=${encodeURIComponent(targetDomain)}`;

  console.log('  Opening:', fullUrl);

  await page.goto(fullUrl);

  console.log('  Waiting for result...');
  await expect(page.getByTestId('integration')).toHaveText(/\{.*\}/s, { timeout: 60000 });

  const json = await page.getByTestId('integration').innerText();
  const { sent, recv, server_name, version, meta } = JSON.parse(json);

  console.log('  Received SERVER:', recv);
  console.log('  Sent SERVER:', sent);
  expect(version).toBe(versionEnv);
  expect(new URL(meta.notaryUrl!).protocol === 'http:');
  expect(server_name).toContain(targetDomain);
  expect(sent).toContain(targetDomain);

});
