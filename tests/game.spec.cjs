const { test, expect } = require('@playwright/test');
const url = process.env.GAME_URL || 'http://127.0.0.1:18770/videogame/';
async function start(page) {
  await page.goto(url);
  await page.locator('#enter-button').click();
  await expect.poll(() => page.locator('video#scene-video').evaluate(v => !v.paused && v.currentTime > 0)).toBe(true);
}
async function qte(page) {
  await expect.poll(() => page.locator('#scene-video').evaluate(v => Number.isFinite(v.duration) && v.readyState >= 2)).toBe(true);
  await page.locator('#scene-video').evaluate(v => { v.currentTime = v.duration - 1.6; });
  await expect(page.locator('#choices')).toHaveAttribute('aria-hidden', 'false');
}
test('first visit requests only intro, with no autoplay', async ({ page }) => {
  const files = new Set();
  page.on('request', r => { if (r.url().includes('.mp4')) files.add(r.url().split('/').pop()); });
  await page.goto(url);
  await page.waitForTimeout(1000);
  expect([...files]).toEqual(['01_intro.mp4']);
  expect(await page.locator('#scene-video').evaluate(v => v.paused)).toBe(true);
});
for (const [first, second, title, file] of [
  ['fight', 'core', '破魔', '03A1_core.mp4'], ['fight', 'chain', '借势', '03A2_chain.mp4'],
  ['escape', 'seal', '封魔', '03B1_seal.mp4'], ['escape', 'bridge', '断桥', '03B2_bridge.mp4'],
]) {
  test(`tap fallback completes ${title}, back and restart`, async ({ page }) => {
    await start(page);
    await qte(page);
    await page.locator(`[data-choice="${first}"]`).click();
    await expect.poll(() => page.locator('#scene-video').evaluate(v => v.currentTime > 0 && !v.paused)).toBe(true);
    await qte(page);
    await page.locator(`[data-choice="${second}"]`).click();
    await expect(page.locator('#scene-video')).toHaveAttribute('src', `./media/${file}`);
    await expect.poll(() => page.locator('#scene-video').evaluate(v => v.readyState >= 2)).toBe(true);
    await page.locator('#scene-video').evaluate(v => { v.currentTime = v.duration - .15; });
    await expect(page.locator('#ending-panel')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#ending-title')).toHaveText(title);
    await page.locator('#back-button').click();
    await expect(page.locator('#scene-video')).toHaveAttribute('src', first === 'fight' ? './media/02A_fight.mp4' : './media/02B_escape.mp4');
    await qte(page);
    await page.locator(`[data-choice="${second}"]`).click();
    await expect.poll(() => page.locator('#scene-video').evaluate(v => v.readyState >= 2)).toBe(true);
    await page.locator('#scene-video').evaluate(v => { v.currentTime = v.duration - .15; });
    await expect(page.locator('#ending-panel')).toHaveAttribute('aria-hidden', 'false');
    await page.locator('#restart-button').click();
    await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/01_intro.mp4');
  });
}

async function swipe(page, dx, dy, duration = 100) {
  const box = await page.locator('#stage').boundingBox();
  const x = box.x + box.width * .5, y = box.y + box.height * .48;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  if (duration) await page.waitForTimeout(duration);
  await page.mouse.up();
}
test('small and slow movements do not branch; left and upward swipes do', async ({ page }) => {
  await start(page); await qte(page);
  await swipe(page, -20, 0);
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/01_intro.mp4');
  await swipe(page, -80, 0, 900);
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/01_intro.mp4');
  await swipe(page, -85, 0);
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/02A_fight.mp4');
  await qte(page); await swipe(page, 0, -85);
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/03A1_core.mp4');
});
test('diagonal slash and right dodge choose their exact branches', async ({ page }) => {
  await start(page); await qte(page);
  await page.locator('[data-choice="fight"]').click();
  await qte(page); await swipe(page, 75, 75);
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/03A2_chain.mp4');
  await page.reload(); await page.locator('#enter-button').click(); await qte(page);
  await swipe(page, 85, 0);
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/02B_escape.mp4');
  await qte(page); await swipe(page, 85, 0);
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/03B2_bridge.mp4');
});
test('hold release and movement cancel; a full hold seals', async ({ page }) => {
  await start(page); await qte(page); await page.locator('[data-choice="escape"]').click(); await qte(page);
  const seal = page.locator('[data-choice="seal"]');
  const b = await seal.boundingBox(), x = b.x + b.width / 2, y = b.y + 25;
  await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(450); await page.mouse.up();
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/02B_escape.mp4');
  await expect(page.locator('.hold-progress')).toHaveCSS('stroke-dashoffset', '100px');
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 25, y); await page.waitForTimeout(1050); await page.mouse.up();
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/02B_escape.mp4');
  await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(1050); await page.mouse.up();
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/03B1_seal.mp4');
});
test('two immediate choices produce only one branch and one history entry', async ({ page }) => {
  await start(page); await qte(page);
  await page.locator('#choice-buttons').evaluate(el => { const all = [...el.querySelectorAll('button')]; all[0].click(); all[1].click(); all[0].click(); });
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/02A_fight.mp4');
  await qte(page); await page.locator('[data-choice="core"]').click();
  await expect.poll(() => page.locator('#scene-video').evaluate(v => v.readyState >= 2)).toBe(true);
  await page.locator('#scene-video').evaluate(v => { v.currentTime = v.duration - .15; });
  await expect(page.locator('#ending-panel')).toHaveAttribute('aria-hidden', 'false');
  await page.locator('#back-button').click();
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/02A_fight.mp4');
});
test('play rejection offers a user gesture to continue without restarting', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play; let blocked = false;
    HTMLMediaElement.prototype.play = function () {
      if (this.id === 'scene-video' && !blocked) { blocked = true; return Promise.reject(new DOMException('Gesture required', 'NotAllowedError')); }
      return original.call(this);
    };
  });
  await page.goto(url); await page.locator('#enter-button').click();
  await expect(page.locator('#continue-panel')).toHaveAttribute('aria-hidden', 'false');
  await page.locator('#continue-button').click();
  await expect.poll(() => page.locator('#scene-video').evaluate(v => !v.paused && v.currentTime > 0)).toBe(true);
  await qte(page);
});
test('failed branch retries current clip and offers restart only after repeated failure', async ({ page }) => {
  let broken = true;
  await page.route('**/02A_fight.mp4', route => broken ? route.abort('failed') : route.continue());
  await start(page); await qte(page); await page.locator('[data-choice="fight"]').click();
  await expect(page.locator('#error-panel')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#error-restart')).toBeHidden();
  await page.locator('#error-retry').click();
  await expect(page.locator('#error-panel')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#error-restart')).toBeVisible();
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/02A_fight.mp4');
  broken = false; await page.locator('#error-retry').click();
  await expect.poll(() => page.locator('#scene-video').evaluate(v => !v.paused && v.currentTime > 0)).toBe(true);
  await qte(page); await page.locator('[data-choice="chain"]').click();
  await expect(page.locator('#scene-video')).toHaveAttribute('src', './media/03A2_chain.mp4');
});
test('slow next clip keeps a real previous frame under loading', async ({ page }) => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/02A_fight.mp4', async route => { await gate; await route.continue().catch(() => {}); });
  await start(page); await qte(page); await page.locator('[data-choice="fight"]').click();
  await expect(page.locator('#loading-panel')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#frozen-frame')).toHaveClass(/frame-visible/);
  expect(await page.locator('#frozen-frame').evaluate(c => c.width === 360 && c.height === 640 && c.getContext('2d').getImageData(100, 100, 1, 1).data[3] === 255)).toBe(true);
  await page.waitForTimeout(500); release();
  await expect(page.locator('#loading-panel')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#frozen-frame')).not.toHaveClass(/frame-visible/);
});
test('only the active branch downloads and controls stay in combat area', async ({ page }) => {
  const files = new Set();
  page.on('request', r => { if (r.url().includes('.mp4')) files.add(r.url().split('/').pop()); });
  await start(page);
  await expect.poll(() => files.size).toBe(1);
  expect([...files].sort()).toEqual(['01_intro.mp4']);
  await qte(page);
  const bounds = await page.locator('#stage').boundingBox();
  for (const b of await page.locator('.combat-action').all()) {
    const rect = await b.boundingBox();
    expect((rect.y - bounds.y) / bounds.height).toBeGreaterThan(.55);
    expect((rect.y + rect.height - bounds.y) / bounds.height).toBeLessThan(.73);
  }
  await page.locator('[data-choice="fight"]').click();
  await expect.poll(() => files.size).toBe(2);
  expect([...files].sort()).toEqual(['01_intro.mp4', '02A_fight.mp4']);
  expect(await page.locator('video').count()).toBe(1);
});
test('landscape hint disappears when portrait returns', async ({ page }) => {
  await page.goto(url); await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#rotate-hint')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#rotate-hint')).toBeHidden();
});
