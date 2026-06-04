const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen,
	createTiddlerInBrowser, deleteTiddlerFromBrowser, paletteType,
} = require("./helpers");

/**
 * cascade-palette Phase 3 — the "Manage axes" field-editor drill
 * (cp-axis-rows / cp-axis-edit-rows / cp-axis-editor), mirroring the lens
 * editor. Drilling navigates by clicking rows (row mousedown → fireSelected).
 *
 * E2E-LIMIT: the "+ New axis…" creator opens the live match-count key editor
 * via the edit-mode text path, awkward to drive via dispatched keyboard
 * events — covered by Jasmine (test-axis-editor.js: _newAxisScratchpad opens
 * the ca-axis-key editor; _finalizeAxisSaveAsNew; _cloneAxisToUser;
 * _deleteAxis).
 */

test.describe.configure({ mode: "serial" });

const AXIS_TAG = "$:/tags/rimir/cascade-palette/axis";

async function drillRow(page, text) {
	const row = page.locator(".rcp-results .rcp-row", { hasText: text }).first();
	await expect(row).toBeVisible();
	await row.click();
	await page.waitForTimeout(150);
}

async function openManageAxes(page) {
	await openPalette(page);
	// Root-menu entries display their tiddler title; narrow to the single
	// "manage-axes" entry and click it.
	await paletteType(page, "Manage ax");
	const entry = page.locator(".rcp-results .rcp-row", { hasText: "manage-axes" }).first();
	await expect(entry).toBeVisible();
	await entry.click();
	await page.waitForTimeout(150);
}

test.describe("cascade-palette axis editor", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await closePaletteIfOpen(page);
		// Remove user axis copies / seeds (real tiddlers only) + data seeds.
		await page.evaluate(() => {
			$tw.wiki.filterTiddlers(
				"[all[tiddlers]tag[$:/tags/rimir/cascade-palette/axis]]"
			).forEach(function (t) {
				var nm = ($tw.wiki.getTiddler(t).fields["ca-axis-name"]) || "";
				if (/\(copy\)/.test(nm) || /^ZAxis/.test(nm)) $tw.wiki.deleteTiddler(t);
			});
			["ZAxisData1"].forEach(function (t) { $tw.wiki.deleteTiddler(t); });
		});
	});

	test("Manage axes drills into the creator + axis list", async ({ page }) => {
		await openManageAxes(page);
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "+ New axis" })
		).toHaveCount(1);
		// A shipped axis is listed (Year (created) / Month (created) / …).
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "created" }).first()
		).toBeVisible();
	});

	test("drilling a shipped axis offers only Clone-to-edit", async ({ page }) => {
		await openManageAxes(page);
		await drillRow(page, "Year (created)");
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "Clone to a custom axis to edit" })
		).toHaveCount(1);
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "Delete this axis" })
		).toHaveCount(0);
	});

	test("cloning a shipped axis creates an editable user copy", async ({ page }) => {
		await openManageAxes(page);
		await drillRow(page, "Year (created)");
		await drillRow(page, "Clone to a custom axis to edit");
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "(copy)" }).first()
		).toBeVisible();
		const copies = await page.evaluate(() =>
			$tw.wiki.filterTiddlers(
				"[all[tiddlers]tag[$:/tags/rimir/cascade-palette/axis]]"
			).filter(function (t) {
				return /\(copy\)/.test($tw.wiki.getTiddler(t).fields["ca-axis-name"] || "");
			}).length
		);
		expect(copies).toBeGreaterThan(0);
	});

	test("an axis chain groups the result tree into buckets, end-to-end", async ({ page }) => {
		// Axes are what "Manage axes" creates/edits; the shipped "By date"
		// view declares a year→month→day chain. Seed a tiddler with a known
		// created year and assert the chain buckets the tree (and that
		// drilling a year bucket descends into the month axis).
		await createTiddlerInBrowser(page, "ZAxisData1", {
			text: "axis demo", created: "20240115120000000",
		});
		await openPalette(page);
		await page.locator(".rcp-view-strip .rcp-view-pill", { hasText: "By date" })
			.first().click();
		await page.waitForTimeout(200);

		// A "2024" year bucket (a drill row) appears — the first axis grouped it.
		const yearBucket = page.locator(".rcp-results .rcp-row", { hasText: "2024" }).first();
		await expect(yearBucket).toBeVisible();
		await expect(yearBucket.locator(".rcp-row-chevron")).toHaveCount(1);

		// Drilling the year descends into the month axis → a "Jan" bucket.
		await yearBucket.click();
		await page.waitForTimeout(200);
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "Jan" }).first()
		).toBeVisible();
	});

	test("a user axis drill renders its editable facet rows", async ({ page }) => {
		await createTiddlerInBrowser(page, "$:/zaxis/status", {
			tags: [AXIS_TAG], type: "text/vnd.tiddlywiki",
			"ca-axis-name": "ZAxisStatus",
			"ca-axis-key": "[<currentTiddler>get[status]]",
			"ca-axis-sort": "asc",
		});
		await openManageAxes(page);
		await drillRow(page, "ZAxisStatus");
		for (const label of ["name", "key", "label", "sort", "Delete this axis"]) {
			await expect(
				page.locator(".rcp-results .rcp-row", { hasText: label }).first()
			).toBeVisible();
		}
		await deleteTiddlerFromBrowser(page, "$:/zaxis/status");
	});
});
