const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen, isPaletteOpen,
	createTiddlerInBrowser, deleteTiddlerFromBrowser, paletteType, paletteKey,
} = require("./helpers");

/**
 * cascade-palette core navigation — drilling into a stage and popping back,
 * and firing a row's action (navigate + close). Click a row → fireSelected
 * (drills a drill-row, fires a leaf/action).
 */

test.describe.configure({ mode: "serial" });

test.describe("cascade-palette navigation", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});
	test.afterEach(async ({ page }) => {
		await closePaletteIfOpen(page);
	});

	test("drilling a drill row pushes a stage; Esc pops back to root", async ({ page }) => {
		await openPalette(page);
		// Root → Manage lenses (a known drill) → its sub-list.
		await paletteType(page, "Manage lens");
		await page.locator(".rcp-results .rcp-row", { hasText: "manage-lenses" }).first().click();
		await page.waitForTimeout(150);
		// Sub-stage rows (the lens creator rows) are now shown.
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "+ New name lens" })
		).toHaveCount(1);
		// The breadcrumb reflects the deeper stage.
		await expect(page.locator(".rcp-breadcrumb")).toBeVisible();

		// Esc pops one stage back to root — the root entry is visible again
		// and the sub-stage creator row is gone.
		await paletteKey(page, "Escape");
		await page.waitForTimeout(150);
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "manage-lenses" }).first()
		).toBeVisible();
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "+ New name lens" })
		).toHaveCount(0);
	});

	test("firing a data row navigates to the tiddler and closes the palette", async ({ page }) => {
		await createTiddlerInBrowser(page, "ZNavTarget", { text: "navigate to me" });
		await openPalette(page);
		// All tiddlers view → data rows carrying a navigate action.
		await page.locator(".rcp-view-strip .rcp-view-pill", { hasText: "All tiddlers" })
			.first().click();
		await page.waitForTimeout(150);
		await paletteType(page, "ZNavTarget");
		const row = page.locator(".rcp-results .rcp-row", { hasText: "ZNavTarget" }).first();
		await expect(row).toBeVisible();
		await row.click();

		// Palette closes and the tiddler is opened in the story river.
		await page.waitForFunction(() => {
			var bp = document.querySelector(".rcp-backdrop");
			return !bp || bp.style.display === "none";
		}, { timeout: 5000 });
		expect(await isPaletteOpen(page)).toBe(false);
		await expect(
			page.locator('.tc-tiddler-frame[data-tiddler-title="ZNavTarget"]')
		).toBeVisible();
		await deleteTiddlerFromBrowser(page, "ZNavTarget");
	});
});
