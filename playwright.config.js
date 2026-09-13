import {defineConfig} from '@playwright/test';
// Tests run against a Jekyll build: the desktop's index.html contains Liquid
// and cannot be served raw. Point SITE_DIR at a build (CI downloads the
// site-seeded artifact into _site).
const site = process.env.SITE_DIR || '_site';
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60000,
  use: {baseURL: 'http://127.0.0.1:18764', headless: true},
  webServer: {command: `python3 -m http.server 18764 --bind 127.0.0.1 --directory ${site}`, url: 'http://127.0.0.1:18764/linxicon-solver/', reuseExistingServer: false},
  reporter: 'list'
});
