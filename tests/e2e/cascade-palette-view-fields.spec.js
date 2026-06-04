const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen, paletteType,
	createTiddlerInBrowser,
} = require("./helpers");

/**
 * cascade-palette Phase 4 — the view LONG-TAIL field editor (cp-view-edit-rows),
 * reached via Manage views → "Edit all fields…". For a USER view it renders
 * grouped bind rows (identity / display toggles / picking / row defaults); for
 * a SHIPPED view it offers a fork-to-edit leaf. The row-shape, grouping, bind
 * targets and operand self-healing are unit-tested in test-view-edit-rows.js —
 * this E2E drives the real Manage-views drill + a live toggle write.
 */

test.describe.configure({ mode: "serial" });

const VIEW_TAG = "$:/tags/rimir/cascade-palette/view";

async function openManageViews(page) {
	await paletteType(page, "Manage view");
	await page.locator(".rcp-results .rcp-row", { hasText: "fork or delete" })
		.first().click();
	await page.waitForTimeout(150);
}
async function editAllFields(page) {
	await page.locator(".rcp-results .rcp-row", { hasText: "Edit all fields" })
		.first().click();
	await page.waitForTimeout(200);
}

async function purge(page) {
	await page.evaluate(() => {
		$tw.wiki.filterTiddlers("[all[tiddlers]tag[$:/tags/rimir/cascade-palette/view]]")
			.forEach((t) => {
				const f = ($tw.wiki.getTiddler(t) || { fields: {} }).fields;
				if (/^ZVFView/.test(f["ca-view-name"] || "") || /\(copy\)\s*$/.test(f["ca-view-name"] || "")) {
					$tw.wiki.deleteTiddler(t);
				}
			});
		$tw.wiki.filterTiddlers("[all[tiddlers]tag[$:/tags/rimir/cascade-palette/structure-layer]]")
			.forEach((t) => {
				if (/^ZVFLayer/.test((($tw.wiki.getTiddler(t) || { fields: {} }).fields["ca-layer-name"]) || "")) {
					$tw.wiki.deleteTiddler(t);
				}
			});
		["$:/zvf/view", "$:/zvf/view2", "$:/zvf/layer", "ZVFData1"].forEach((t) => $tw.wiki.deleteTiddler(t));
	});
}

test.describe("cascade-palette view field editor", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		await purge(page);
	});
	test.afterEach(async ({ page }) => {
		await closePaletteIfOpen(page);
		await purge(page);
	});

	test("a shipped active view offers fork-to-edit, not bind rows", async ({ page }) => {
		await openPalette(page); // default view is a shipped (shadow) view
		await openManageViews(page);
		await editAllFields(page);
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "Fork to a custom view to edit" })
		).toHaveCount(1);
	});

	test("a user view renders editable facet rows; a toggle writes the field", async ({ page }) => {
		await createTiddlerInBrowser(page, "$:/zvf/view", {
			tags: [VIEW_TAG], type: "text/vnd.tiddlywiki",
			"ca-view-name": "ZVFView", "ca-view-roots": "[tag[ZVFData]]",
			// Force the entries layer so the command menu stays reachable at
			// root on this otherwise-flat view (flat views don't auto-append it).
			"ca-view-include-entries": "yes",
		});
		await createTiddlerInBrowser(page, "ZVFData1", { tags: ["ZVFData"], text: "x" });

		await openPalette(page);
		await selectView(page, "ZVFView");
		await openManageViews(page);
		await editAllFields(page);

		// Long-tail facet rows render (name + a display toggle + a picking text).
		for (const label of ["name", "show-count", "after-fire", "row-icon"]) {
			await expect(
				page.locator(".rcp-results .rcp-row", { hasText: label }).first()
			).toBeVisible();
		}

		// Toggling show-count flips the bound field on the view tiddler.
		const before = await page.evaluate(() =>
			($tw.wiki.getTiddler("$:/zvf/view").fields["ca-view-show-count"]) || "");
		await page.locator(".rcp-results .rcp-row", { hasText: "show-count" }).first().click();
		await page.waitForTimeout(150);
		const after = await page.evaluate(() =>
			($tw.wiki.getTiddler("$:/zvf/view").fields["ca-view-show-count"]) || "");
		expect(after).not.toBe(before);
		expect(["yes", "no"]).toContain(after);
	});

	test("an explicit-layer view drills each layer into its own field editor", async ({ page }) => {
		const BUILTIN = "$:/plugins/rimir/cascade-palette/structure-layers/entries";
		await createTiddlerInBrowser(page, "$:/zvf/layer", {
			tags: ["$:/tags/rimir/cascade-palette/structure-layer"], type: "text/vnd.tiddlywiki",
			"ca-layer-name": "ZVFLayer", "ca-layer-roots": "[tag[ZVFData]]",
		});
		await createTiddlerInBrowser(page, "$:/zvf/view2", {
			tags: [VIEW_TAG], type: "text/vnd.tiddlywiki",
			"ca-view-name": "ZVFView2", "ca-view-layers": BUILTIN + " $:/zvf/layer",
		});
		await createTiddlerInBrowser(page, "ZVFData1", { tags: ["ZVFData"], text: "x" });

		await openPalette(page);
		await selectView(page, "ZVFView2");
		await openManageViews(page);
		await editAllFields(page);

		// A "layer: ZVFLayer" drill row appears (entries layer excluded).
		const layerRow = page.locator(".rcp-results .rcp-row", { hasText: "layer: ZVFLayer" }).first();
		await expect(layerRow).toBeVisible();
		await layerRow.click();
		await page.waitForTimeout(200);

		// Its long-tail layer facets render.
		for (const label of ["name", "source", "row-icon", "include-position"]) {
			await expect(
				page.locator(".rcp-results .rcp-row", { hasText: label }).first()
			).toBeVisible();
		}
	});
});

async function selectView(page, name) {
	await page.locator(".rcp-view-strip .rcp-view-pill", { hasText: name })
		.first().click();
	await page.waitForTimeout(150);
}
