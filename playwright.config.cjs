const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  webServer: { command: 'node tests/server.cjs', url: 'http://127.0.0.1:18770/videogame/', reuseExistingServer: false }, timeout: 30000, workers: 1,
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
});
