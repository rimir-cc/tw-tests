const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen, createTiddlerInBrowser, deleteTiddlerFromBrowser,
} = require("./helpers");

/**
 * cascade-palette Phase 6 — the large-root-set perf warning fires end to end.
 * The dedup / re-arm / threshold logic is unit-tested in test-large-root-set.js;
 * this confirms recomputeStage actually invokes it in the live widget. We drop
 * the threshold to a tiny value so the default root view (more rows than that)
 * trips the one-time console.warn.
 */

test.describe.configure({ mode: "serial" });

const CONFIG = "$:/config/rimir/cascade-palette/large-root-set-warning";

test.describe("cascade-palette large-root-set warning", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});
	test.afterEach(async ({ page }) => {
		await closePaletteIfOpen(page);
		await deleteTiddlerFromBrowser(page, CONFIG); // restore the shipped default
	});

	test("a root view above the threshold warns once to the console", async ({ page }) => {
		const warnings = [];
		page.on("console", (msg) => {
			if (msg.type() === "warning" && /view root set/.test(msg.text())) {
				warnings.push(msg.text());
			}
		});
		// Tiny threshold so the default root menu (several command rows) trips it.
		await createTiddlerInBrowser(page, CONFIG, { text: "2" });
		await openPalette(page);
		await page.waitForTimeout(200);

		expect(warnings.length).toBeGreaterThan(0);
		expect(warnings[0]).toMatch(/exceeds threshold 2/);
	});

	test("threshold 0 disables the warning", async ({ page }) => {
		const warnings = [];
		page.on("console", (msg) => {
			if (msg.type() === "warning" && /view root set/.test(msg.text())) {
				warnings.push(msg.text());
			}
		});
		await createTiddlerInBrowser(page, CONFIG, { text: "0" });
		await openPalette(page);
		await page.waitForTimeout(200);
		expect(warnings.length).toBe(0);
	});
});
