import { test, expect } from '@playwright/test';

const targetDomain = process.env.TARGET_DOMAIN;

test.skip('verify', async ({ page }) => {
    // log browser console messages
    // page.on('console', (msg) => {
    //   console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    // });

    await page.goto('/verify');

    await expect(page.getByTestId('verify')).toHaveText(/\{.*\}/s);

    const json = await page.getByTestId('verify').innerText();
    const { sent, recv } = JSON.parse(json);
    // expect(sent).toContain(`host: ${targetDomain}`);
});
