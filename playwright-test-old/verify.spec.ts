import { test, expect } from '@playwright/test';

test('verify', async ({ page }) => {

    await page.goto('/verify');

    await expect(page.getByTestId('verify')).toHaveText(/\{.*\}/s);

    const json = await page.getByTestId('verify').innerText();
    const { sent, recv } = JSON.parse(json);

    // expect(sent).toContain('host: myprotein.ro');
});
