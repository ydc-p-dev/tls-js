import { test, expect } from '@playwright/test';

const targetDomain = process.env.TARGET_DOMAIN;
const versionEnv = process.env.VERSION ?? '0.1.0-alpha.12';

console.log('Server Side');
test('integration', async ({ page }) => {
  // test.setTimeout(600000)
  console.log('🎯 Testing domain:', targetDomain);
  console.log('\n🎯 Running notarization for:', targetDomain);

  await page.addInitScript(domain => {
    window.__TARGET_DOMAIN__ = domain;
  }, targetDomain);

  // Логування для дебагу
  page.on('console', msg => {
    const text = msg.text();
    // Фільтруємо шум
    if (!text.includes('DevTools') && !text.includes('Download')) {
      console.log('  [Browser]:', text);
    }
  });

  page.on('pageerror', error => {
    console.error('  [Browser Error]:', error.message);
  });

  const base = process.env.BASE_URL || 'http://localhost:3001';
  const fullUrl = `${base}/integration.html?domain=${encodeURIComponent(targetDomain)}`;

  console.log('  Opening:', fullUrl);

  try {
    await page.goto(fullUrl, {
      timeout: 90000 ,
      waitUntil: 'networkidle'
    });
    console.log('  Waiting for result...');

    // Очистити кеш
    // await page.evaluate(() => {
    //   if ('caches' in window) {
    //     caches.keys().then(names => {
    //       names.forEach(name => caches.delete(name));
    //     });
    //   }
    // });

    // Чекаємо на результат (JSON або помилку)
    await expect(page.getByTestId('integration')).toHaveText(/\{.*\}/s, { timeout: 540000 });

    const json = await page.getByTestId('integration').innerText();

    let result;
    try {
      result = JSON.parse(json);
    } catch (e) {
      // Виводимо помилку парсингу в stdout для notarize.js
      console.error('❌ Failed to parse JSON result');
      console.error('Error:', e.message);
      console.error('Received text:', json);
      throw new Error(`Failed to parse JSON: ${e.message}`);
    }

    // Якщо помилка в результаті - виводимо детально
    if (result.success === false) {
      console.error('\n❌ Notarization failed in browser!');
      console.error('═══════════════════════════════════════');
      console.error('Error:', result.error || 'Unknown error');
      console.error('Domain:', result.domain || targetDomain);

      if (result.error) {
        console.error('Error details:', JSON.stringify(result.error, null, 2));
      }

      console.error('═══════════════════════════════════════\n');

      // Кидаємо помилку для playwright
      const errorMessage = typeof result.error === 'string'
        ? result.error
        : result.error?.message || 'Notarization failed';

      throw new Error(`❌ Notarization failed: ${errorMessage}`);
    }

    const { sent, recv, server_name, version, meta } = result;

    // Перевірки
    expect(version).toBe(versionEnv);
    expect(new URL(meta.notaryUrl!).protocol).toBe('http:');
    expect(server_name).toContain(targetDomain);
    expect(sent).toContain(targetDomain);

    console.log('\n✅ All checks passed!');
    console.log('═══════════════════════════════════════');
    console.log('Server:', server_name);
    console.log('Sent bytes:', sent.length);
    console.log('Received bytes:', recv.length);
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    // Виводимо помилку в stdout для notarize.js
    console.error('\n❌ Test execution failed!');
    console.error('═══════════════════════════════════════');
    console.error('Error message:', error.message);
    console.error('Error type:', error.constructor.name);
    console.error('═══════════════════════════════════════\n');

    // // Скриншот для дебагу
    // try {
    //   const screenshotPath = 'output/error-screenshot.png';
    //   await page.screenshot({ path: screenshotPath, fullPage: true });
    //   console.log(`  📸 Screenshot saved to ${screenshotPath}`);
    // } catch (screenshotErr) {
    //   console.error('  ⚠️ Could not save screenshot:', screenshotErr.message);
    // }

    // Обов'язково кидаємо помилку далі
    throw error;
  }
});