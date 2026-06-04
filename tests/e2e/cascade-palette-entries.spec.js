const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen, paletteType,
} = require("./helpers");

/**
 * cascade-palette Phase 5 — the "Manage entries" / "Manage actions" lists +
 * per-definition field editors (cp-def-editor / cp-def-rows /
 * cp-entry-edit-rows / cp-action-edit-rows). Drilling navigates by clicking
 * rows (row mousedown → fireSelected).
 *
 * E2E-LIMIT: the "+ New …" creator opens a name-prompt in the edit-mode text
 * path, awkward to drive via dispatched keyboard events — covered by Jasmine
 * (test-def-editor.js: _newEntry / _newAction save under the right namespace).
 * Cloning a shipped definition is a pure click, so the editable-copy loop IS
 * driven here end to end.
 */

test.describe.configure({ mode: "serial" });

const ENTRY_TAG = "$:/tags/rimir/cascade-palette/entry";
const ACTION_TAG = "$:/tags/rimir/cascade-palette/action";

async function drillRow(page, text) {
	const row = page.locator(".rcp-results .rcp-row", { hasText: text }).first();
	await expect(row).toBeVisible();
	await row.click();
	await page.waitForTimeout(150);
}

// The manage-entries / manage-actions rows render their title path under the
// default view, so drill them by their stable hint substring.
async function openManage(page, hintFragment) {
	await openPalette(page);
	await paletteType(page, "Manage");
	await drillRow(page, hintFragment);
}

async function purge(page) {
	await page.evaluate(() => {
		const killCopies = (tag, field) =>
			$tw.wiki.filterTiddlers("[all[tiddlers]tag[" + tag + "]]").forEach((t) => {
				if (/\(copy\)\s*$/.test((($tw.wiki.getTiddler(t) || { fields: {} }).fields[field]) || "")) {
					$tw.wiki.deleteTiddler(t);
				}
			});
		killCopies("$:/tags/rimir/cascade-palette/entry", "ca-name");
		killCopies("$:/tags/rimir/cascade-palette/action", "ca-name");
	});
}

test.describe("cascade-palette entry + action editor", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		await purge(page);
	});
	test.afterEach(async ({ page }) => {
		await closePaletteIfOpen(page);
		await purge(page);
	});

	test("Manage entries lists a creator + shipped entries; a shipped entry is clone-only", async ({ page }) => {
		await openManage(page, "command entries"); // manage-entries hint
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "+ New entry" })
		).toHaveCount(1);
		// Drill a known shipped entry → only clone-to-edit, no bind facets.
		await drillRow(page, "Configurations");
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "Clone to a custom entry to edit" })
		).toHaveCount(1);
	});

	test("cloning a shipped entry creates an editable user copy with facet rows", async ({ page }) => {
		await openManage(page, "command entries");
		await drillRow(page, "Configurations");
		await drillRow(page, "Clone to a custom entry to edit"); // reopens Manage entries
		// The copy now appears; drill it and confirm editable facets render.
		await drillRow(page, "(copy)");
		for (const label of ["name", "kind", "actions"]) {
			await expect(
				page.locator(".rcp-results .rcp-row", { hasText: label }).first()
			).toBeVisible();
		}
		const copies = await page.evaluate(() =>
			$tw.wiki.filterTiddlers("[all[tiddlers]tag[$:/tags/rimir/cascade-palette/entry]]")
				.filter((t) => /\(copy\)\s*$/.test(($tw.wiki.getTiddler(t).fields["ca-name"]) || "")).length);
		expect(copies).toBeGreaterThan(0);
	});

	test("Manage actions lists a creator; a shipped action is clone-only", async ({ page }) => {
		await openManage(page, "per-row commands"); // manage-actions hint
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "+ New action" })
		).toHaveCount(1);
		// Drill the first shipped action row (under "Shipped actions").
		const shipped = page.locator(".rcp-results .rcp-row", { hasText: "shipped" }).first();
		await expect(shipped).toBeVisible();
		await shipped.click();
		await page.waitForTimeout(150);
		await expect(
			page.locator(".rcp-results .rcp-row", { hasText: "Clone to a custom action to edit" })
		).toHaveCount(1);
	});
});
