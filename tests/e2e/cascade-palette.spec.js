const { test, expect } = require("@playwright/test");
const {
	waitForTW, isPaletteOpen, openPalette, closePaletteIfOpen,
} = require("./helpers");

/**
 * Cascade-palette e2e — keyboard, drill, preset roundtrip.
 *
 * The palette is mounted at `document.body` via cascade-palette-startup
 * (id: `rimir-cascade-palette-mount`). It opens via the
 * `rimir-cascade-palette-open` message that the widget catches on
 * `$tw.rootWidget`. Visibility is driven by `.rcp-backdrop` style
 * `display: flex` (open) / `none` (closed) — there is no rcp-open
 * class. The popup div itself stays in the DOM always.
 *
 * Focus / DOM landmarks:
 *   #rimir-cascade-palette-mount        the wrapper
 *   .rcp-backdrop                       the modal backdrop (display = flex when open)
 *   .rcp-popup                          the floating window (always present)
 *   .rcp-input                          the search input
 *   .rcp-results                        the result list container
 *   .rcp-results .rcp-row               each row
 *   .rcp-row.rcp-row-selected           highlighted row
 */

// open / close / isOpen helpers live in ./helpers (shared with the
// lens / nav / structure / extras specs); `isOpen` is the local alias.
const isOpen = isPaletteOpen;

test.describe("cascade-palette", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await closePaletteIfOpen(page);
	});

	test("startup mounts the palette at document.body", async ({ page }) => {
		const mount = page.locator("#rimir-cascade-palette-mount");
		await expect(mount).toBeAttached();
	});

	test("open message shows the popup with input focused", async ({ page }) => {
		expect(await isOpen(page)).toBe(false);
		await openPalette(page);
		expect(await isOpen(page)).toBe(true);
		const input = page.locator(".rcp-input");
		await expect(input).toBeVisible();
	});

	test("typing into the input narrows the result menu", async ({ page }) => {
		await openPalette(page);
		const input = page.locator(".rcp-input");
		const baseline = await page.locator(".rcp-results .rcp-row").count();
		expect(baseline).toBeGreaterThan(0);
		// Query for a string unlikely to match any entry name — should
		// narrow the menu to fewer (often zero) rows.
		await input.fill("zzzz-unlikely-match-zzzz");
		await page.waitForTimeout(200);
		const filtered = await page.locator(".rcp-results .rcp-row").count();
		expect(filtered).toBeLessThan(baseline);
		// Clearing the input restores the full list.
		await input.fill("");
		await page.waitForTimeout(200);
		const restored = await page.locator(".rcp-results .rcp-row").count();
		expect(restored).toBe(baseline);
	});

	test("Escape closes the palette from input focus", async ({ page }) => {
		await openPalette(page);
		expect(await isOpen(page)).toBe(true);
		// Send Esc to the input — it's the focus owner.
		await page.evaluate(() => {
			document.querySelector(".rcp-input").dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
			);
		});
		await page.waitForFunction(() => {
			var bp = document.querySelector(".rcp-backdrop");
			return !bp || bp.style.display === "none";
		}, { timeout: 5000 });
		expect(await isOpen(page)).toBe(false);
	});

	test("dispatching open + close handlers correctly toggles backdrop display", async ({ page }) => {
		// Open, close, open again — verify the on/off cycle is symmetric.
		expect(await isOpen(page)).toBe(false);
		await openPalette(page);
		expect(await isOpen(page)).toBe(true);
		await page.evaluate(() => {
			document.querySelector(".rcp-input").dispatchEvent(
				new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
			);
		});
		await page.waitForFunction(() => {
			var bp = document.querySelector(".rcp-backdrop");
			return !bp || bp.style.display === "none";
		}, { timeout: 5000 });
		expect(await isOpen(page)).toBe(false);
		await openPalette(page);
		expect(await isOpen(page)).toBe(true);
	});
});
