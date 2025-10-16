import { test, expect } from '@playwright/test';

console.log('ssss');
test('integration', async ({ page }) => {
    // log browser console messages
    // page.on('console', (msg) => {
    //     console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    // });

    await page.goto('/integration');

    await expect(page.getByTestId('integration')).toHaveText(/\{.*\}/s, { timeout: 60000 });

    const json = await page.getByTestId('integration').innerText();
    const { sent, recv, server_name, version, meta } = JSON.parse(json);
    // console.log('sent',sent);
    // return;

    expect(version).toBe('0.1.0-alpha.12');
    expect(new URL(meta.notaryUrl!).protocol === 'http:');
    // expect(server_name).toBe('myprotein.ro');

    // expect(sent).toContain('host: myprotein.ro');
    // expect(sent).not.toContain('secret: test_secret');
    // expect(recv).toContain('"id": 1234567890');
    // expect(recv).toContain('"city": "Anytown"');
    // expect(recv).toContain('"postalCode": "12345"');

});
