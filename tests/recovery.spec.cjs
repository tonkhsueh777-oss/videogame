const { test, expect } = require('@playwright/test');
const url = 'http://127.0.0.1:18770/videogame/';

test('a slow response does not discard the download after twenty seconds', async ({ page }) => {
  await page.clock.install();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/01_intro.mp4', async route => { await pending; await route.continue().catch(() => {}); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('#enter-button').click();
  await page.clock.fastForward(21000);
  try {
    await expect(page.locator('#error-panel')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#loading-panel')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#loading-message')).toContainText('网络较慢');
  } finally { release(); }
});

test('buffering recovery removes the veil even without a frame callback', async ({ page }) => {
  await page.goto(url);
  await page.locator('#enter-button').click();
  await expect(page.locator('#loading-panel')).toHaveAttribute('aria-hidden', 'true');
  await expect.poll(() => page.locator('#scene-video').evaluate(v => v.currentTime > .3)).toBe(true);
  await page.locator('#scene-video').evaluate(v => {
    v.requestVideoFrameCallback = () => 10000;
    v.dispatchEvent(new Event('waiting'));
    v.dispatchEvent(new Event('playing'));
  });
  await expect(page.locator('#loading-panel')).toHaveAttribute('aria-hidden', 'true', { timeout: 1500 });
});

test('touch attacks confirm the chosen action while the next clip is loading', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/02A_fight.mp4', async route => { await pending; await route.continue().catch(() => {}); });
  await page.goto(url);
  await page.locator('#enter-button').tap();
  await expect(page.locator('[data-choice="fight"]')).toBeVisible({ timeout: 10000 });
  await page.locator('[data-choice="fight"]').tap();
  try {
    await expect(page.locator('#combat-result')).toBeVisible();
    await expect(page.locator('#combat-result')).toHaveText('招架成功');
    await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/02A_fight.mp4');
    await expect(page.locator('#frozen-frame')).toHaveClass(/frame-visible/);
  } finally { release(); }
  await expect(page.locator('#loading-panel')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#combat-result')).toBeHidden();
});

test('reconnect immediately hides the retry action and ignores a second activation', async ({ page }) => {
  await page.clock.install();
  let release, requests = 0;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/01_intro.mp4', async route => {
    requests += 1;
    await pending;
    await route.continue().catch(() => {});
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('#enter-button').click();
  await expect.poll(() => requests).toBe(1);
  await page.clock.fastForward(21000);
  await expect(page.locator('#loading-retry')).toBeVisible();
  await page.locator('#loading-retry').evaluate(button => { button.click(); button.click(); });
  try {
    await expect(page.locator('#loading-retry')).toBeHidden();
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator('#loading-message')).toHaveText('命运正在改变……');
  } finally { release(); }
});

test('a pending continue request still offers slow-network recovery', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    let calls = 0;
    HTMLMediaElement.prototype.play = function () {
      calls += 1;
      if (calls === 1) return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
      return new Promise(() => {});
    };
  });
  await page.goto(url);
  await page.locator('#enter-button').click();
  await expect(page.locator('#continue-panel')).toHaveAttribute('aria-hidden', 'false');
  await page.locator('#continue-button').click();
  await page.clock.fastForward(21000);
  await expect(page.locator('#loading-retry')).toBeVisible();
  await expect(page.locator('#loading-message')).toContainText('网络较慢');
  await expect(page.locator('#error-panel')).toHaveAttribute('aria-hidden', 'true');
});
