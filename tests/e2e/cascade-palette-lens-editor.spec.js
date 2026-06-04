const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen,
	createTiddlerInBrowser, deleteTiddlerFromBrowser, paletteType,
} = require("./helpers");

/**
 * cascade-palette — the "Manage lenses" field-editor drill (cp-lens-rows /
 * cp-lens-edit-rows). Drives the real drill navigation by clicking rows
 * (a row mousedown → fireSelected, which drills a drill-row / fires a leaf).
 *
 * Covered here (browser-real): the drill lists creator + lens rows; a
 * shipped lens offers only "Clone to edit"; cloning produces an editable
 * user copy; a user lens drill renders its editable facet rows.
 *
 * E2E-LIMIT: the in-place edit-mode commits (name edit, the auto-resolve
 * filter↔template clear, the confirm-gated delete) are driven through the
 * edit-mode text path which is awkward to exercise reliably via dispatched
 * keyboard events — those are covered by the Jasmine unit specs
 * (test-lens-edit-rows.js: auto-resolve ca-on-commit + conflict markers;
 * test-lens-editor.js: _cloneLensToUser, _deleteLens).
 */

test.describe.configure({ mode: "serial" });

const LENS_TAG = "$:/tags/rimir/cascade-palette/lens";

async function drillRow(page, text) {
	const row = page.locator(".rcp-results .rcp-row", { hasText: text }).first();
	await expect(row).toBeVisible();
	await row.click();
	await page.waitForTimeout(150);
}

async function openManageLenses(page) {
	await openPalette(page);
	// Root-menu entries display their tiddler title (the search still matches
	// ca-name/hint), so narrow to the single "manage-lenses" entry and click
	// it rather than matching its display text.
	await paletteType(page, "Manage lens");
	const entry = page.locator(".rcp-results .rcp-row", { hasText: "manage-lenses" }).first();
	await expect(entry).toBeVisible();
	await entry.click();
	await page.waitForTimeout(150);
}

test.describe("cascade-palette lens editor", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await closePaletteIfOpen(page);
		// Remove any user lens copies / seeds these tests created (real
		// tiddlers only — [all[tiddlers]] excludes shipped shadows).
		await page.evaluate(() => {
			var titles = $tw.wiki.filterTiddlers(
				"[all[tiddlers]tag[$:/tags/rimir/cascade-palette/lens]]"
			);
			titles.forEach(function (t) {
				var tid = $tw.wiki.getTiddler(t);
				var nm = (tid && tid.fields["ca-lens-name"]) || "";
				if (/\(copy\)/.test(nm) || /^ZEdit/.test(nm)) $tw.wiki.deleteTiddler(t);
			});
		});
	});

	test("Manage lenses drills into the creator + lens list", async ({ page }) => {
		await openManageLenses(page);
		// Creator rows (one per slot) + shipped lens rows.
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "+ New name lens" })
		).toHaveCount(1);
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "+ New annotation lens" })
		).toHaveCount(1);
		// A shipped name lens is listed (Caption → Title).
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "Caption" }).first()
		).toBeVisible();
	});

	test("drilling a shipped lens offers only Clone-to-edit", async ({ page }) => {
		await openManageLenses(page);
		await drillRow(page, "Caption"); // shipped → clone-only field editor
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "Clone to a custom lens to edit" })
		).toHaveCount(1);
		// No in-place editable scalar facet rows for a shipped lens.
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "Delete this lens" })
		).toHaveCount(0);
	});

	test("cloning a shipped lens creates an editable user copy", async ({ page }) => {
		await openManageLenses(page);
		await drillRow(page, "Caption");
		// Fire the clone leaf — it clones to LENS_NS and reopens the list.
		await drillRow(page, "Clone to a custom lens to edit");
		// The list now shows a "… (copy)" row under "Your lenses".
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "(copy)" }).first()
		).toBeVisible();
		// And a real user-lens tiddler now exists.
		const copies = await page.evaluate(() =>
			$tw.wiki.filterTiddlers(
				"[all[tiddlers]tag[$:/tags/rimir/cascade-palette/lens]]"
			).filter(function (t) {
				var f = $tw.wiki.getTiddler(t).fields;
				return /\(copy\)/.test(f["ca-lens-name"] || "");
			}).length
		);
		expect(copies).toBeGreaterThan(0);
	});

	test("a user lens drill renders its editable facet rows", async ({ page }) => {
		await createTiddlerInBrowser(page, "$:/zlens/edit", {
			tags: [LENS_TAG], type: "text/vnd.tiddlywiki",
			"ca-lens-name": "ZEditLens", "ca-lens-chip": "ZEditLens",
			"ca-lens-annotation-filter": "[<currentTiddler>get[zx]]",
		});
		await openManageLenses(page);
		await drillRow(page, "ZEditLens");
		// Editable scalar facets + actions drill + delete are present.
		for (const label of ["name", "chip", "when", "order", "actions", "Delete this lens"]) {
			await expect(
				page.locator(".rcp-results .rcp-row", { hasText: label }).first()
			).toBeVisible();
		}
		await deleteTiddlerFromBrowser(page, "$:/zlens/edit");
	});
});
