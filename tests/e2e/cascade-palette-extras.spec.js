const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen,
	createTiddlerInBrowser, deleteTiddlerFromBrowser, paletteType, paletteKey,
} = require("./helpers");

/**
 * cascade-palette extras — sticky-context pins.
 *
 * Typing `+<title>` + Enter pins a tiddler into the sticky context
 * (cp-context-pills); the pill row persists across close/reopen because the
 * state lives in $:/temp/.../sticky-context.
 *
 * E2E-LIMIT (deferred to unit / manual): the leader key + idle-window
 * gesture (cp-leaders) depends on precise real-time idle timing that is
 * brittle under dispatched events; the side-preview pane (.rcp-preview-pane)
 * ←/→ candidate cycling requires a registered ca-preview-template candidate
 * for the current context. The Part-A decision (preview focus has no section
 * keydown handler — pane scrolls natively, candidate pills switch on click)
 * is verified by test-keyboard-dispatch.js (no "preview" dispatch row).
 */

test.describe.configure({ mode: "serial" });

const STICKY = "$:/temp/rimir/cascade-palette/sticky-context";

test.describe("cascade-palette extras", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});
	test.afterEach(async ({ page }) => {
		await closePaletteIfOpen(page);
		await page.evaluate((s) => {
			$tw.wiki.deleteTiddler(s);
			$tw.wiki.deleteTiddler("ZCtxPin");
		}, STICKY);
	});

	test("a +title pin shows in the context strip and persists across reopen", async ({ page }) => {
		await createTiddlerInBrowser(page, "ZCtxPin", { text: "pin me" });
		await openPalette(page);
		await paletteType(page, "+ZCtxPin");
		await paletteKey(page, "Enter");
		await page.waitForTimeout(150);
		await expect(
			page.locator(".rcp-context-strip", { hasText: "ZCtxPin" })
		).toBeVisible();

		// Close, then reopen — the sticky pin survives.
		await paletteKey(page, "Escape");
		await page.waitForFunction(() => {
			var bp = document.querySelector(".rcp-backdrop");
			return !bp || bp.style.display === "none";
		}, { timeout: 5000 });
		await openPalette(page);
		await expect(
			page.locator(".rcp-context-strip", { hasText: "ZCtxPin" })
		).toBeVisible();
	});
});
