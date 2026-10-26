// The Make it sheet in mock mode: the board's numbers, the checks ticking in, the estimate with its working, the
// fab actions, keyboard and phones.
const { test, expect } = require("@playwright/test");

const BOARD = "/board.html?mock=1&world=fixtures&id=gh:etch-fixtures/devkit-s3";

async function open(page, url = BOARD) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector("body.ready", { timeout: 20000 });
  return errors;
}

test("the sheet shows the numbers, every check and the estimate @phone", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator("#makeB")).toHaveAttribute("title", "Not checked yet");
  await page.click("#makeB");
  await expect(page.locator("body")).toHaveClass(/mk-on/);
  await expect(page.locator(".mk h2")).toHaveText("Make it");
  await expect(page.locator(".mk")).toContainText("30.0 × 20.0 mm");
  await expect(page.locator(".mk")).toContainText("2 layers");
  // every check row lands, 90 ms apart, with the backend's own labels
  await expect(page.locator(".mk .ag-task")).toHaveCount(9);
  await expect(page.locator(".mk .ag-bn-pill")).toHaveText("8 of 8 pass", { timeout: 8000 });
  await expect(page.locator(".mk")).toContainText("Schematic rules (ERC)");
  await expect(page.locator(".mk")).toContainText("Couldn't measure");
  await expect(page.locator("#makeB")).toHaveAttribute("title", "All checks pass");
  await expect(page.locator(".mk")).toContainText("Rough estimate");
  await expect(page.locator(".mk")).toContainText("About $2.00");
  await expect(page.locator('.mk button:has-text("Download fab files")')).not.toHaveAttribute("aria-disabled", "true", { timeout: 8000 });
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveClass(/mk-on/);
  expect(errors).toEqual([]);
});

test("the M key toggles it and Copy BOM writes a table", async ({ page, context }) => {
  await open(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#stage").click({ position: { x: 20, y: 20 } });
  await page.keyboard.press("m");
  await expect(page.locator("body")).toHaveClass(/mk-on/);
  await expect(page.locator(".mk .ag-bn-pill")).toHaveText("8 of 8 pass", { timeout: 8000 });
  await page.locator('.mk button:has-text("Copy BOM")').click();
  await expect(page.locator(".toast")).toContainText("BOM copied");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.split("\n")[0]).toMatch(/Qty\tRefs\tValue\tFootprint/);
  await page.keyboard.press("m");
  await expect(page.locator("body")).not.toHaveClass(/mk-on/);
});

test("a new board has nothing to make yet", async ({ page }) => {
  await open(page, "/board.html?mock=1&world=fixtures&new=1");
  await expect(page.locator("#makeB")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#makeB")).toHaveAttribute("title", /Describe your board first/);
});
