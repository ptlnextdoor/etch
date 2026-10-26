// Before a design build: the experience picker on the start screen, Etch's quick questions with its pick marked,
// the answers folded into the request, Skip building as typed.
const { test, expect } = require("@playwright/test");

const NEW = "/board.html?mock=1&world=fixtures&new=1";

async function open(page, url = NEW) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector("body.ready", { timeout: 20000 });
  await page.waitForSelector(".nb-xp");
  return errors;
}

test("the picker remembers the level and sets how much is asked @phone", async ({ page }) => {
  await open(page);
  const radios = page.locator('.nb-xp [role="radio"]');
  await expect(radios).toHaveCount(3);
  await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
  await radios.nth(0).click();
  await expect(radios.nth(0)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("etch-xp"))).toBe("beginner");
  await page.reload();
  await page.waitForSelector(".nb-xp");
  await expect(page.locator('.nb-xp [role="radio"]').nth(0)).toHaveAttribute("aria-checked", "true");
});

test("questions come with Etch's pick, and the answers fold into the build", async ({ page }) => {
  const errors = await open(page);
  await page.fill(".nb-in", "a night light");
  await page.keyboard.press("Enter");
  const card = page.locator(".ag-ask").first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await expect(card.locator(".ag-card-k")).toHaveText("Quick question · 1 of 3");
  await expect(card.locator(".ag-card-q")).toHaveText("How should it get power?");
  await expect(card.locator(".ag-opt.on")).toHaveCount(1);
  await expect(card.locator(".ag-opt.on")).toContainText("USB-C");
  await expect(card.locator(".ag-opt-pick")).toContainText("Etch's pick");
  await expect(card.locator(".ag-btn.primary")).toBeEnabled();
  // take the pick on each question; the last primary reads Build it
  await card.locator(".ag-btn.primary").click();
  const second = page.locator(".ag-ask:not(.settled)").first();
  await expect(second.locator(".ag-card-k")).toHaveText("Quick question · 2 of 3");
  await second.locator(".ag-btn.primary").click();
  const third = page.locator(".ag-ask:not(.settled)").first();
  await expect(third.locator(".ag-btn.primary")).toHaveText("Build it");
  await third.locator(".ag-btn.primary").click();
  await expect.poll(() => page.evaluate(() => window.__editor.board.prompt), { timeout: 8000 }).toBe("a night light, powered over USB-C, keep the board as small as possible, with a status LED");
  expect(await page.evaluate(() => window.__editor.board.building)).toBe(true);
  expect(errors).toEqual([]);
});

test("Skip on the first question builds exactly what was typed", async ({ page }) => {
  await open(page);
  await page.fill(".nb-in", "a night light");
  await page.keyboard.press("Enter");
  const card = page.locator(".ag-ask").first();
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.locator('button:has-text("Skip")').click();
  await expect.poll(() => page.evaluate(() => window.__editor.board.prompt), { timeout: 8000 }).toBe("a night light");
  await expect(page.locator(".ag-ask.settled").first()).toContainText("Skipped");
});
