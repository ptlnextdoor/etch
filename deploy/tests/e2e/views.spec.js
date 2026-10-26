// The editor's flat views in mock mode: 3D · 2D · Schematic, the demo build's board and schematic
// (deploy/etch-app/fixtures/views/*.json), selection and net lighting shared across views, keys, phones.
const { test, expect } = require("@playwright/test");

const BOARD = "/board.html?mock=1&world=fixtures&id=gh:etch-fixtures/devkit-s3";

async function open(page, url = BOARD) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForSelector("body.ready", { timeout: 20000 });
  return errors;
}
// the 2D view, once its draw-in has finished (parts pop in over the first second; clicks before that land askew)
async function openPlan(page) {
  await page.click('#viewSeg [data-value="plan"]');
  await page.waitForSelector(".pv .fp");
  await expect(page.locator(".pv")).not.toHaveClass(/draw/, { timeout: 5000 });
}

test("the view switch shows the board flat and as a schematic @phone", async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator("#viewSeg [data-value]")).toHaveText(["3D", "2D", "Schematic"]);
  await page.click('#viewSeg [data-value="plan"]');
  await expect(page.locator("body")).toHaveClass(/v-plan/);
  await expect(page.locator(".pv .fp")).toHaveCount(5); // U1 R1 D1 J1 H1
  await expect(page.locator(".pv .pad")).toHaveCount(16);
  await expect(page.locator(".pv-dim.w")).toHaveText("30.0 mm");
  await expect(page.locator(".pv-scale-l")).toContainText("mm");
  expect(await page.evaluate(() => location.search)).toContain("view=plan");
  await page.click('#viewSeg [data-value="sch"]');
  await expect(page.locator("body")).toHaveClass(/v-sch/);
  await expect(page.locator(".schv .sym")).toHaveCount(5); // 4 parts + the PWR_FLAG
  await expect(page.locator(".schv .sv-sub")).toHaveText("Schematic · 4 parts · 4 nets");
  await page.click('#viewSeg [data-value="3d"]');
  await expect(page.locator("body")).toHaveClass(/v-3d/);
  await expect(page.locator(".pv-host")).toBeHidden();
  expect(errors).toEqual([]);
});

test("a pad lights its net everywhere and the inspector shows the net", async ({ page }) => {
  await open(page);
  await openPlan(page);
  await page.locator('.pv .pad[data-ref="R1"][data-pad="1"]').click({ force: true });
  await expect(page.locator(".pv")).toHaveClass(/has-net/);
  expect(await page.evaluate(() => window.__editor.net)).toBe("VBUS");
  expect(await page.evaluate(() => window.__editor.sel)).toEqual(["R1"]);
  await expect(page.locator('.pv .track.lit')).toHaveCount(3);
  // the part card carries the net; clearing the selection shows the net's own card
  await expect(page.locator(".insp .chip.acc")).toHaveText("VBUS");
  await page.locator(".insp .chip.acc").click();
  await expect(page.locator(".insp .in-k")).toHaveText("Net");
  await expect(page.locator(".insp .in-t")).toHaveText("VBUS");
  await expect(page.locator(".insp .chip")).toHaveText(["U1", "R1"]);
  // the schematic keeps the lit net; its labels light up
  await page.locator('.insp .act:has-text("Schematic")').click();
  await expect(page.locator("body")).toHaveClass(/v-sch/);
  await expect(page.locator(".schv .lbl.lit")).toHaveCount(3);
  // Esc clears the net first
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__editor.net)).toBeNull();
  await expect(page.locator(".schv .lbl.lit")).toHaveCount(0);
});

test("selection follows between the schematic, the list and the flat board", async ({ page }) => {
  await open(page);
  await page.keyboard.press("3");
  await page.waitForSelector(".schv .sym");
  await page.locator('.schv .sym[data-ref="U1"] .hit').click({ force: true });
  expect(await page.evaluate(() => window.__editor.sel)).toEqual(["U1"]);
  await expect(page.locator(".schv .so-foot")).toHaveCount(1);
  await expect(page.locator(".insp .in-t b")).toHaveText("U1");
  await openPlan(page);
  await expect(page.locator('.pv .fp[data-ref="U1"]')).toHaveClass(/on/);
  await expect(page.locator(".pv .so-foot")).toHaveCount(1);
  // a hole is drawn but never selected
  await page.locator('.pv .fp[data-ref="H1"] .hit').click({ force: true });
  expect(await page.evaluate(() => window.__editor.sel)).not.toContain("H1");
});

test("Top and Bottom, the Layers popover and the B key @phone", async ({ page }) => {
  await open(page);
  await openPlan(page);
  await expect(page.locator(".pv")).toHaveAttribute("data-side", "F");
  await page.click('#sideSeg [data-v="B"]');
  await expect(page.locator(".pv")).toHaveAttribute("data-side", "B", { timeout: 5000 });
  await expect(page.locator(".pv-side")).toHaveText("Bottom side, mirrored");
  await expect(page.locator('.pv .fp[data-ref="D1"] .ref')).toBeVisible();
  await page.keyboard.press("b");
  await expect(page.locator(".pv")).toHaveAttribute("data-side", "F", { timeout: 5000 });
  await page.click("#layersB");
  await expect(page.locator("#layersPop")).toHaveClass(/show/);
  await expect(page.locator("#layersPop .ly-row")).toHaveCount(8);
  await page.locator('#layersPop .ly-row:has-text("Pads") button').click();
  await expect(page.locator(".pv")).not.toHaveClass(/l-pads/);
  await page.locator('#layersPop .ly-all').click();
  await expect(page.locator(".pv")).toHaveClass(/l-pads/);
});

test("the flat views stay out of reach on a new board", async ({ page }) => {
  await open(page, "/board.html?mock=1&world=fixtures&new=1");
  await expect(page.locator('#viewSeg [data-value="plan"]')).toHaveAttribute("aria-disabled", "true");
  await page.locator('#viewSeg [data-value="plan"]').click({ force: true });
  await expect(page.locator("body")).not.toHaveClass(/v-plan/);
  await expect(page.locator(".toast")).toContainText("Describe your board first");
});

test("the hover tag names pads, tracks and vias", async ({ page }) => {
  await open(page);
  await openPlan(page);
  await page.locator('.pv .pad[data-ref="U1"][data-pad="8"]').hover({ force: true });
  await expect(page.locator("#htag")).toHaveText(/U1 pin 8 · VBUS/);
  await page.locator(".pv .via").first().hover({ force: true });
  await expect(page.locator("#htag")).toHaveText(/Via · LED_A · 0.3 mm drill/);
});

// a real library board, no backend and no demo data: its own prerendered views (library/flat_views.py)
test("a library board shows its own 2D board and schematic @phone", async ({ page }) => {
  await page.route("**/config.json", (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/board.html?id=" + encodeURIComponent("gh:OLIMEX/ESP32-POE/HARDWARE/ESP32-PoE-hardware-revision-M2"));
  await page.waitForSelector("body.ready", { timeout: 30000 });
  await page.click('#viewSeg [data-value="plan"]');
  await expect(page.locator(".pv .fp")).toHaveCount(143, { timeout: 15000 });
  await expect(page.locator(".pv-dim.w")).toHaveText("28.0 mm");
  await page.click('#viewSeg [data-value="sch"]');
  await expect(page.locator(".schv .sym").first()).toBeVisible({ timeout: 15000 });
  expect(await page.locator(".schv .sym").count()).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test("a library board without a schematic keeps that segment off", async ({ page }) => {
  await page.route("**/config.json", (r) => r.fulfill({ contentType: "application/json", body: "{}" }));
  await page.goto("/board.html?id=" + encodeURIComponent("gh:im-tomu/tomu-hardware/pcb"));
  await page.waitForSelector("body.ready", { timeout: 30000 });
  await expect(page.locator('#viewSeg [data-value="plan"]')).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator('#viewSeg [data-value="sch"]')).toHaveAttribute("aria-disabled", "true");
});
