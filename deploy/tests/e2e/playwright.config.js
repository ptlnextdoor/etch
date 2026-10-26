// Etch e2e: the static pages served by deploy/serve_page.py, in ?mock=1 mode (no backend). Chromium only; a phone
// project runs the same specs at 390 x 844.
//   cd deploy/tests/e2e && npm ci && npx playwright install chromium && npm test
const { defineConfig, devices } = require("@playwright/test");
const PORT = process.env.ETCH_E2E_PORT || "8766";
module.exports = defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.js/,
  timeout: 45000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: { command: `python3 ../../serve_page.py ${PORT}`, url: `http://127.0.0.1:${PORT}/board.html`, reuseExistingServer: true, timeout: 20000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }, testMatch: /.*\.spec\.js/, grep: /@phone/ },
  ],
});
