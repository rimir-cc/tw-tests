const { test, expect } = require("@playwright/test");
const {
	waitForTW,
	createTiddler,
	deleteTiddler,
	navigateToTiddler,
	openEditor,
	getDraftFrame,
	openSnapshotPreview,
	saveDraft,
} = require("./helpers");

const TIDDLER = "MinverTestTiddler";

/**
 * Modify draft text field via TW wiki store (avoids iframe/textarea complexity).
 */
async function setDraftText(page, title, text) {
	await page.evaluate(({ title, text }) => {
		const draftTitle = $tw.wiki.findDraft(title);
		if (!draftTitle) throw new Error("No draft found for " + title);
		const draft = $tw.wiki.getTiddler(draftTitle);
		$tw.wiki.addTiddler(new $tw.Tiddler(draft, { text }));
	}, { title, text });
}

test.describe("minver plugin", () => {
	test.beforeEach(async ({ page, request }) => {
		await deleteTiddler(request, TIDDLER).catch(() => {});
		await createTiddler(request, TIDDLER, { text: "Initial content", tags: "test" });
		await page.goto("/");
		await waitForTW(page);
		// Discard any leftover drafts
		await page.evaluate((title) => {
			const draftTitle = $tw.wiki.findDraft(title);
			if (draftTitle) $tw.wiki.deleteTiddler(draftTitle);
			// Clear story list
			$tw.wiki.addTiddler({ title: "$:/StoryList", text: "", list: "" });
		}, TIDDLER);
		// Clear minver localStorage
		await page.evaluate(() => {
			for (let i = localStorage.length - 1; i >= 0; i--) {
				const key = localStorage.key(i);
				if (key && key.startsWith("minver:")) localStorage.removeItem(key);
			}
		});
		// Clean minver temp state
		await page.evaluate(() => {
			const temps = $tw.wiki.filterTiddlers("[prefix[$:/temp/minver/]]");
			temps.forEach((t) => $tw.wiki.deleteTiddler(t));
		});
	});

	test.afterEach(async ({ request }) => {
		await deleteTiddler(request, TIDDLER).catch(() => {});
	});

	test("manual snapshot appears in dropdown", async ({ page }) => {
		await navigateToTiddler(page, TIDDLER);
		await openEditor(page, TIDDLER);
		await openSnapshotPreview(page, TIDDLER);

		const draft = getDraftFrame(page, TIDDLER);

		// Initially no snapshots
		await expect(draft.locator(".mv-empty")).toBeVisible();

		// Take a snapshot with a label
		await draft.locator(".mv-label-input").fill("my-first-snap");
		await draft.locator(".mv-snapshot-btn").click();

		// Empty state should disappear
		await expect(draft.locator(".mv-empty")).not.toBeVisible();

		// Snapshot should appear in the select dropdown
		const select = draft.locator(".mv-select");
		const options = select.locator("option");
		await expect(options).toHaveCount(2);
		await expect(options.nth(1)).toContainText("my-first-snap");
	});

	test("snapshot captures current draft fields and shows diff", async ({ page }) => {
		await navigateToTiddler(page, TIDDLER);
		await openEditor(page, TIDDLER);
		await openSnapshotPreview(page, TIDDLER);

		const draft = getDraftFrame(page, TIDDLER);

		// Take snapshot of initial state
		await draft.locator(".mv-snapshot-btn").click();

		// Modify the draft text via wiki store
		await setDraftText(page, TIDDLER, "Modified content");

		// Select the snapshot from dropdown
		const select = draft.locator(".mv-select");
		const snapshotOption = select.locator("option").nth(1);
		const value = await snapshotOption.getAttribute("value");
		await select.selectOption(value);

		// Diff should be visible showing the text field changed
		await expect(draft.locator(".mv-field-diffs")).toBeVisible();
		await expect(draft.locator(".mv-field-name").filter({ hasText: "text" })).toBeVisible();
	});

	test("rollback-field restores single field from snapshot", async ({ page }) => {
		await navigateToTiddler(page, TIDDLER);
		await openEditor(page, TIDDLER);
		await openSnapshotPreview(page, TIDDLER);

		const draft = getDraftFrame(page, TIDDLER);

		// Snapshot initial state
		await draft.locator(".mv-snapshot-btn").click();

		// Modify text
		await setDraftText(page, TIDDLER, "Changed text");

		// Select the snapshot
		const select = draft.locator(".mv-select");
		const value = await select.locator("option").nth(1).getAttribute("value");
		await select.selectOption(value);

		// Wait for diff to appear
		await expect(draft.locator(".mv-field-diffs .mv-field-row")).toBeVisible();

		// Find the text field's undo button and click it
		const textFieldRow = draft.locator(".mv-field-row").filter({
			has: page.locator(".mv-field-name", { hasText: "text" }),
		});
		await textFieldRow.locator(".mv-field-reset").click();

		// Verify via wiki store that text was rolled back
		const text = await page.evaluate((title) => {
			const draftTitle = $tw.wiki.findDraft(title);
			return $tw.wiki.getTiddler(draftTitle).fields.text;
		}, TIDDLER);
		expect(text).toBe("Initial content");
	});

	test("auto-snapshot is created on save", async ({ page }) => {
		await navigateToTiddler(page, TIDDLER);

		// Edit and save to trigger auto-snapshot
		await openEditor(page, TIDDLER);
		await setDraftText(page, TIDDLER, "Edit 1");
		await saveDraft(page, TIDDLER);

		// Edit again and check snapshot preview
		await openEditor(page, TIDDLER);
		await openSnapshotPreview(page, TIDDLER);

		const draft2 = getDraftFrame(page, TIDDLER);
		const select = draft2.locator(".mv-select");
		const options = select.locator("option");

		// Should have placeholder + 1 auto-snapshot
		await expect(options).toHaveCount(2);
		// Auto-snapshots use ◦ prefix
		await expect(options.nth(1)).toContainText("◦");
	});

	test("delete snapshot removes it from dropdown", async ({ page }) => {
		await navigateToTiddler(page, TIDDLER);
		await openEditor(page, TIDDLER);
		await openSnapshotPreview(page, TIDDLER);

		const draft = getDraftFrame(page, TIDDLER);

		// Create a snapshot
		await draft.locator(".mv-snapshot-btn").click();
		const select = draft.locator(".mv-select");
		await expect(select.locator("option")).toHaveCount(2);

		// Select the snapshot
		const value = await select.locator("option").nth(1).getAttribute("value");
		await select.selectOption(value);

		// Accept the confirm dialog
		page.on("dialog", (dialog) => dialog.accept());
		await draft.locator(".mv-select-delete").click();

		// Should be back to just the placeholder
		await expect(select.locator("option")).toHaveCount(1);
		await expect(draft.locator(".mv-empty")).toBeVisible();
	});

	test("snapshot manager lists tiddlers with snapshots", async ({ page }) => {
		await navigateToTiddler(page, TIDDLER);
		await openEditor(page, TIDDLER);
		await openSnapshotPreview(page, TIDDLER);

		const draft = getDraftFrame(page, TIDDLER);

		// Create a labeled snapshot
		await draft.locator(".mv-label-input").fill("manager-test");
		await draft.locator(".mv-snapshot-btn").click();

		// Navigate to the manager via story list
		await navigateToTiddler(page, "$:/plugins/rimir/minver/manager");
		await page.waitForSelector(".mv-manager");

		// Should list our test tiddler
		const managerTiddler = page.locator(".mv-manager-tiddler").filter({ hasText: TIDDLER });
		await expect(managerTiddler).toBeVisible();
		await expect(managerTiddler.locator(".mv-manager-count")).toContainText("1");

		// Expand and check the snapshot label
		await managerTiddler.locator(".mv-manager-toggle").click();
		await expect(managerTiddler.locator("td").filter({ hasText: "manager-test" })).toBeVisible();
	});

	test("compare mode toggles between Draft and Saved", async ({ page }) => {
		await navigateToTiddler(page, TIDDLER);
		await openEditor(page, TIDDLER);
		await setDraftText(page, TIDDLER, "Saved version");
		await saveDraft(page, TIDDLER);

		// Open editor again
		await openEditor(page, TIDDLER);
		await openSnapshotPreview(page, TIDDLER);

		const draft = getDraftFrame(page, TIDDLER);

		// There should be an auto-snapshot from the first save
		const select = draft.locator(".mv-select");
		await expect(select.locator("option")).toHaveCount(2);

		// Modify the draft text
		await setDraftText(page, TIDDLER, "Draft version");

		// Select the snapshot
		const value = await select.locator("option").nth(1).getAttribute("value");
		await select.selectOption(value);

		// Default compare mode is "Draft"
		await expect(draft.locator(".mv-toggle-active")).toContainText("Draft");

		// Switch to "Saved" mode
		await draft.locator(".mv-toggle-btn").filter({ hasText: "Saved" }).click();
		await expect(draft.locator(".mv-toggle-btn.mv-toggle-active")).toContainText("Saved");

		// The diff should still be visible
		await expect(draft.locator(".mv-field-diffs")).toBeVisible();
	});

	test("multiple snapshots ordered: manual first, then auto", async ({ page }) => {
		await navigateToTiddler(page, TIDDLER);

		// Save once to create an auto-snapshot
		await openEditor(page, TIDDLER);
		await setDraftText(page, TIDDLER, "v2");
		await saveDraft(page, TIDDLER);

		// Edit again, create a manual snapshot
		await openEditor(page, TIDDLER);
		await openSnapshotPreview(page, TIDDLER);

		const draft = getDraftFrame(page, TIDDLER);
		await draft.locator(".mv-label-input").fill("my-manual");
		await draft.locator(".mv-snapshot-btn").click();

		const select = draft.locator(".mv-select");
		const options = select.locator("option");

		// Should have: placeholder, 1 manual (⬥), 1 auto (◦)
		await expect(options).toHaveCount(3);
		await expect(options.nth(1)).toContainText("⬥");
		await expect(options.nth(1)).toContainText("my-manual");
		await expect(options.nth(2)).toContainText("◦");
	});

	test("manual snapshot persists in localStorage across page reload", async ({ page }) => {
		await navigateToTiddler(page, TIDDLER);
		await openEditor(page, TIDDLER);
		await openSnapshotPreview(page, TIDDLER);

		const draft = getDraftFrame(page, TIDDLER);
		await draft.locator(".mv-label-input").fill("persist-test");
		await draft.locator(".mv-snapshot-btn").click();

		// Verify snapshot exists before reload
		await expect(draft.locator(".mv-select option")).toHaveCount(2);

		// Reload page
		await page.reload();
		await waitForTW(page);
		// Wait for minver startup to hydrate from localStorage
		await page.waitForTimeout(1000);

		await navigateToTiddler(page, TIDDLER);
		await openEditor(page, TIDDLER);
		await openSnapshotPreview(page, TIDDLER);

		const draft2 = getDraftFrame(page, TIDDLER);
		const options = draft2.locator(".mv-select option");
		await expect(options).toHaveCount(2);
		await expect(options.nth(1)).toContainText("persist-test");
	});

	test("export creates JSON tiddler and import restores snapshots", async ({ page }) => {
		await navigateToTiddler(page, TIDDLER);
		await openEditor(page, TIDDLER);
		await openSnapshotPreview(page, TIDDLER);

		const draft = getDraftFrame(page, TIDDLER);
		await draft.locator(".mv-label-input").fill("export-test");
		await draft.locator(".mv-snapshot-btn").click();

		// Navigate to manager and export
		await navigateToTiddler(page, "$:/plugins/rimir/minver/manager");
		await page.waitForSelector(".mv-manager");
		await page.locator("button").filter({ hasText: "Export all Snapshots" }).click();

		// Verify export tiddler was created
		const exportExists = await page.evaluate(() => {
			return !!$tw.wiki.getTiddler("$:/minver/export");
		});
		expect(exportExists).toBe(true);

		// Verify export contains our snapshot
		const exportText = await page.evaluate(() => {
			return $tw.wiki.getTiddlerText("$:/minver/export");
		});
		expect(exportText).toContain("export-test");
		expect(exportText).toContain(TIDDLER);
	});
});

// ---------------------------------------------------------------------------
// Change-group & manager tests
// ---------------------------------------------------------------------------

const CG_TIDDLER_A = "MinverCGTestA";
const CG_TIDDLER_B = "MinverCGTestB";
const CG_TIDDLER_C = "MinverCGTestC";

/**
 * Clear all change-group data (localStorage + temp tiddlers).
 */
async function clearCGData(page) {
	await page.evaluate(() => {
		// Clear CG localStorage keys
		for (var i = localStorage.length - 1; i >= 0; i--) {
			var key = localStorage.key(i);
			if (key && (key.indexOf("minver-cg:") === 0 || key === "minver-cg-index")) {
				localStorage.removeItem(key);
			}
		}
		// Clear CG temp tiddlers
		var temps = $tw.wiki.filterTiddlers("[prefix[$:/temp/minver/cg-]]");
		temps.forEach(function(t) { $tw.wiki.deleteTiddler(t); });
		$tw.wiki.deleteTiddler("$:/temp/minver/change-groups");
	});
}

/**
 * Clear all minver snapshot data (localStorage + temp tiddlers).
 */
async function clearSnapshotData(page) {
	await page.evaluate(() => {
		for (var i = localStorage.length - 1; i >= 0; i--) {
			var key = localStorage.key(i);
			if (key && key.indexOf("minver:") === 0) {
				localStorage.removeItem(key);
			}
		}
		var temps = $tw.wiki.filterTiddlers("[prefix[$:/temp/minver/]]");
		temps.forEach(function(t) { $tw.wiki.deleteTiddler(t); });
	});
}

/**
 * Navigate to the groups viewer tiddler.
 */
async function openGroupsViewer(page) {
	await page.evaluate(() => {
		var list = $tw.wiki.getTiddlerList("$:/StoryList");
		var target = "$:/plugins/rimir/minver/groups";
		if (list.indexOf(target) === -1) {
			list = [target].concat(list);
		}
		$tw.wiki.addTiddler({
			title: "$:/StoryList",
			text: "",
			list: $tw.utils.stringifyList(list),
		});
	});
	await page.locator('[data-tiddler-title="$:/plugins/rimir/minver/groups"]').waitFor();
}

/**
 * Navigate to the snapshot manager tiddler.
 */
async function openManager(page) {
	await page.evaluate(() => {
		var list = $tw.wiki.getTiddlerList("$:/StoryList");
		var target = "$:/plugins/rimir/minver/manager";
		if (list.indexOf(target) === -1) {
			list = [target].concat(list);
		}
		$tw.wiki.addTiddler({
			title: "$:/StoryList",
			text: "",
			list: $tw.utils.stringifyList(list),
		});
	});
	await page.locator('[data-tiddler-title="$:/plugins/rimir/minver/manager"]').waitFor();
}

/**
 * Start recording via cg-storage API.
 * Uses $tw.modules.execute instead of require (require is not in global scope).
 */
async function startRecording(page, label) {
	await page.evaluate((lbl) => {
		var cgStorage = $tw.modules.execute("$:/plugins/rimir/minver/cg-storage.js");
		cgStorage.startRecording($tw.wiki, lbl);
	}, label);
}

/**
 * Stop recording and wait for async localStorage compression to finish.
 */
async function stopRecording(page) {
	await page.evaluate(() => {
		var cgStorage = $tw.modules.execute("$:/plugins/rimir/minver/cg-storage.js");
		return cgStorage.stopRecording($tw.wiki);
	});
	// Small wait for hydrateIndex to propagate to temp tiddlers
	await page.waitForTimeout(300);
}

/**
 * Simulate a save operation with change-group recording.
 * Since addTiddler bypasses th-saving-tiddler, we call recordSave directly.
 */
async function addTiddlerWithRecording(page, title, fields) {
	await page.evaluate(({ title, fields }) => {
		var storage = $tw.modules.execute("$:/plugins/rimir/minver/storage.js");
		var cgStorage = $tw.modules.execute("$:/plugins/rimir/minver/cg-storage.js");
		var beforeFields = storage.captureTiddlerFields($tw.wiki, title, false);
		$tw.wiki.addTiddler(new $tw.Tiddler(fields));
		var afterFields = storage.serializeTiddlerFields($tw.wiki.getTiddler(title).fields);
		cgStorage.recordSave($tw.wiki, title, beforeFields, afterFields);
	}, { title, fields });
}

// ===== 1. Change-group recording =====

test.describe("minver change-group recording", () => {
	test.beforeEach(async ({ page, request }) => {
		// Clean up tiddlers that might be leftover from previous failed runs
		await deleteTiddler(request, "MinverCGNewTiddler").catch(() => {});
		await deleteTiddler(request, "MinverCGEphemeral").catch(() => {});
		// Ensure test tiddlers exist
		await createTiddler(request, CG_TIDDLER_A, { text: "Alpha original", tags: "test" });
		await createTiddler(request, CG_TIDDLER_B, { text: "Beta original", tags: "test" });
		await createTiddler(request, CG_TIDDLER_C, { text: "Charlie original", tags: "test" });
		await page.goto("/");
		await waitForTW(page);
		await clearCGData(page);
		await clearSnapshotData(page);
	});

	test.afterEach(async ({ request }) => {
		await deleteTiddler(request, CG_TIDDLER_A).catch(() => {});
		await deleteTiddler(request, CG_TIDDLER_B).catch(() => {});
		await deleteTiddler(request, CG_TIDDLER_C).catch(() => {});
		await deleteTiddler(request, "MinverCGNewTiddler").catch(() => {});
		await deleteTiddler(request, "MinverCGEphemeral").catch(() => {});
	});

	test("records create, modify, and delete operations", async ({ page }) => {
		await startRecording(page, "three-ops");

		// Create a new tiddler (with recording)
		await addTiddlerWithRecording(page, "MinverCGNewTiddler", { title: "MinverCGNewTiddler", text: "brand new" });

		// Modify an existing tiddler (with recording)
		await page.evaluate((title) => {
			var storage = $tw.modules.execute("$:/plugins/rimir/minver/storage.js");
			var cgStorage = $tw.modules.execute("$:/plugins/rimir/minver/cg-storage.js");
			var beforeFields = storage.captureTiddlerFields($tw.wiki, title, false);
			var t = $tw.wiki.getTiddler(title);
			$tw.wiki.addTiddler(new $tw.Tiddler(t, { text: "Alpha modified" }));
			var afterFields = storage.serializeTiddlerFields($tw.wiki.getTiddler(title).fields);
			cgStorage.recordSave($tw.wiki, title, beforeFields, afterFields);
		}, CG_TIDDLER_A);

		// Delete a tiddler (deleteTiddler wrapper calls recordDelete automatically)
		await page.evaluate((title) => {
			$tw.wiki.deleteTiddler(title);
		}, CG_TIDDLER_B);

		await stopRecording(page);

		// Navigate to groups viewer
		await openGroupsViewer(page);

		// Should show the group
		const group = page.locator(".mv-cg-group");
		await expect(group).toHaveCount(1);
		await expect(group.locator(".mv-cg-group-label")).toContainText("three-ops");
		await expect(group.locator(".mv-cg-op-count")).toContainText("3");

		// Expand the group to see operations (async load from localStorage)
		await group.locator(".mv-cg-toggle").click();
		await expect(group.locator(".mv-cg-ops-table")).toBeVisible({ timeout: 10000 });

		// Verify operation types
		await expect(group.locator(".mv-cg-type-create")).toBeVisible({ timeout: 5000 });
		await expect(group.locator(".mv-cg-type-modify")).toBeVisible();
		await expect(group.locator(".mv-cg-type-delete")).toBeVisible();

		// Cleanup
		await deleteTiddler(page.request, "MinverCGNewTiddler").catch(() => {});
	});

	test("coalesces multiple edits of same tiddler", async ({ page }) => {
		await startRecording(page, "coalesce-test");

		// Edit the same tiddler 3 times (with recording each time)
		for (const text of ["edit-1", "edit-2", "edit-3"]) {
			await page.evaluate(({ title, text }) => {
				var storage = $tw.modules.execute("$:/plugins/rimir/minver/storage.js");
				var cgStorage = $tw.modules.execute("$:/plugins/rimir/minver/cg-storage.js");
				var beforeFields = storage.captureTiddlerFields($tw.wiki, title, false);
				var t = $tw.wiki.getTiddler(title);
				$tw.wiki.addTiddler(new $tw.Tiddler(t, { text: text }));
				var afterFields = storage.serializeTiddlerFields($tw.wiki.getTiddler(title).fields);
				cgStorage.recordSave($tw.wiki, title, beforeFields, afterFields);
			}, { title: CG_TIDDLER_A, text });
		}

		await stopRecording(page);

		await openGroupsViewer(page);

		const group = page.locator(".mv-cg-group");
		await expect(group).toHaveCount(1);
		// Should show 1 op (coalesced), not 3
		await expect(group.locator(".mv-cg-op-count")).toContainText("1");
	});

	test("skips saving empty groups", async ({ page }) => {
		await startRecording(page, "empty-group");
		// Stop immediately without any changes
		await stopRecording(page);

		await openGroupsViewer(page);

		// No groups should appear
		const group = page.locator(".mv-cg-group");
		await expect(group).toHaveCount(0);
	});

	test("create-then-delete produces no operation", async ({ page }) => {
		await startRecording(page, "create-delete-cancel");

		// Create a tiddler (with recording)
		await addTiddlerWithRecording(page, "MinverCGEphemeral", { title: "MinverCGEphemeral", text: "short-lived" });

		// Delete it (deleteTiddler wrapper handles recordDelete automatically)
		await page.evaluate(() => {
			$tw.wiki.deleteTiddler("MinverCGEphemeral");
		});

		await stopRecording(page);

		await openGroupsViewer(page);

		// Group should not be saved (0 net ops)
		const group = page.locator(".mv-cg-group");
		await expect(group).toHaveCount(0);
	});
});

// ===== 2. Change-group UI =====

test.describe("minver change-group UI", () => {
	test.beforeEach(async ({ page, request }) => {
		await createTiddler(request, CG_TIDDLER_A, { text: "Alpha original", tags: "test" });
		await page.goto("/");
		await waitForTW(page);
		await clearCGData(page);
		await clearSnapshotData(page);
	});

	test.afterEach(async ({ request }) => {
		await deleteTiddler(request, CG_TIDDLER_A).catch(() => {});
	});

	test("toolbar button toggles between record and stop", async ({ page }) => {
		// Record button should be visible initially
		const recordBtn = page.locator('[aria-label="Record changes"]');
		const stopBtn = page.locator('[aria-label="Stop recording"]');

		await expect(recordBtn).toBeVisible();
		await expect(stopBtn).not.toBeVisible();

		// Click record
		await recordBtn.click();

		// Now stop button should be visible and record hidden
		await expect(stopBtn).toBeVisible();
		await expect(recordBtn).not.toBeVisible();

		// Click stop
		await stopBtn.click();

		// Back to record
		await expect(recordBtn).toBeVisible();
		await expect(stopBtn).not.toBeVisible();
	});

	test("groups viewer shows active recording banner", async ({ page }) => {
		await startRecording(page, "banner-test");

		// Make a change (with recording)
		await page.evaluate((title) => {
			var storage = $tw.modules.execute("$:/plugins/rimir/minver/storage.js");
			var cgStorage = $tw.modules.execute("$:/plugins/rimir/minver/cg-storage.js");
			var beforeFields = storage.captureTiddlerFields($tw.wiki, title, false);
			var t = $tw.wiki.getTiddler(title);
			$tw.wiki.addTiddler(new $tw.Tiddler(t, { text: "changed" }));
			var afterFields = storage.serializeTiddlerFields($tw.wiki.getTiddler(title).fields);
			cgStorage.recordSave($tw.wiki, title, beforeFields, afterFields);
		}, CG_TIDDLER_A);

		await openGroupsViewer(page);

		// Active banner should be visible
		const banner = page.locator(".mv-cg-active-banner");
		await expect(banner).toBeVisible();
		await expect(banner).toContainText("Recording active");
		await expect(banner).toContainText("1");

		// Stop recording to clean up
		await stopRecording(page);
	});

	test("completed group is expandable with operation details", async ({ page }) => {
		await startRecording(page, "expand-test");

		// Make a change (with recording)
		await page.evaluate((title) => {
			var storage = $tw.modules.execute("$:/plugins/rimir/minver/storage.js");
			var cgStorage = $tw.modules.execute("$:/plugins/rimir/minver/cg-storage.js");
			var beforeFields = storage.captureTiddlerFields($tw.wiki, title, false);
			var t = $tw.wiki.getTiddler(title);
			$tw.wiki.addTiddler(new $tw.Tiddler(t, { text: "modified for expand" }));
			var afterFields = storage.serializeTiddlerFields($tw.wiki.getTiddler(title).fields);
			cgStorage.recordSave($tw.wiki, title, beforeFields, afterFields);
		}, CG_TIDDLER_A);

		await stopRecording(page);

		await openGroupsViewer(page);

		const group = page.locator(".mv-cg-group");
		await expect(group).toHaveCount(1);

		// Initially the ops table should not be visible
		await expect(group.locator(".mv-cg-ops-table")).not.toBeVisible();

		// Click expand toggle
		await group.locator(".mv-cg-toggle").click();

		// Now ops table should be visible
		await expect(group.locator(".mv-cg-ops-table")).toBeVisible();
		// Should contain the tiddler title and modify badge
		await expect(group.locator(".mv-cg-type-modify")).toBeVisible();
	});
});

// ===== 3. Rollback =====

test.describe("minver rollback", () => {
	test.beforeEach(async ({ page, request }) => {
		await createTiddler(request, CG_TIDDLER_A, { text: "Alpha original", tags: "test" });
		await page.goto("/");
		await waitForTW(page);
		await clearCGData(page);
		await clearSnapshotData(page);
	});

	test.afterEach(async ({ request }) => {
		await deleteTiddler(request, CG_TIDDLER_A).catch(() => {});
	});

	test("rollback restores tiddler to original state", async ({ page }) => {
		await startRecording(page, "rollback-test");

		// Modify with recording
		await page.evaluate((title) => {
			var storage = $tw.modules.execute("$:/plugins/rimir/minver/storage.js");
			var cgStorage = $tw.modules.execute("$:/plugins/rimir/minver/cg-storage.js");
			var beforeFields = storage.captureTiddlerFields($tw.wiki, title, false);
			var t = $tw.wiki.getTiddler(title);
			$tw.wiki.addTiddler(new $tw.Tiddler(t, { text: "Alpha modified for rollback" }));
			var afterFields = storage.serializeTiddlerFields($tw.wiki.getTiddler(title).fields);
			cgStorage.recordSave($tw.wiki, title, beforeFields, afterFields);
		}, CG_TIDDLER_A);

		await stopRecording(page);

		// Verify the modification took effect
		const modifiedText = await page.evaluate((title) => {
			return $tw.wiki.getTiddlerText(title);
		}, CG_TIDDLER_A);
		expect(modifiedText).toBe("Alpha modified for rollback");

		await openGroupsViewer(page);

		// Accept the confirm dialog for rollback
		page.on("dialog", (dialog) => dialog.accept());

		// Click rollback on the group
		const group = page.locator(".mv-cg-group");
		await group.locator("button", { hasText: "Rollback" }).click();

		// Wait for async rollback to complete
		await page.waitForTimeout(500);

		// Verify tiddler was restored
		const restoredText = await page.evaluate((title) => {
			return $tw.wiki.getTiddlerText(title);
		}, CG_TIDDLER_A);
		expect(restoredText).toBe("Alpha original");
	});

	test("rollback removes the group from the list", async ({ page }) => {
		await startRecording(page, "rollback-remove-test");

		// Modify with recording
		await page.evaluate((title) => {
			var storage = $tw.modules.execute("$:/plugins/rimir/minver/storage.js");
			var cgStorage = $tw.modules.execute("$:/plugins/rimir/minver/cg-storage.js");
			var beforeFields = storage.captureTiddlerFields($tw.wiki, title, false);
			var t = $tw.wiki.getTiddler(title);
			$tw.wiki.addTiddler(new $tw.Tiddler(t, { text: "will be rolled back" }));
			var afterFields = storage.serializeTiddlerFields($tw.wiki.getTiddler(title).fields);
			cgStorage.recordSave($tw.wiki, title, beforeFields, afterFields);
		}, CG_TIDDLER_A);

		await stopRecording(page);

		await openGroupsViewer(page);

		// Confirm there is 1 group
		await expect(page.locator(".mv-cg-group")).toHaveCount(1);

		// Accept confirm dialog
		page.on("dialog", (dialog) => dialog.accept());

		// Click rollback
		const group = page.locator(".mv-cg-group");
		await group.locator("button", { hasText: "Rollback" }).click();

		// Wait for async rollback + group deletion
		await page.waitForTimeout(500);

		// Group should be removed from the list
		await expect(page.locator(".mv-cg-group")).toHaveCount(0);
	});
});

// ===== 4. Manager revert =====

test.describe("minver manager revert", () => {
	test.beforeEach(async ({ page, request }) => {
		await createTiddler(request, CG_TIDDLER_A, { text: "Alpha original", tags: "test" });
		await page.goto("/");
		await waitForTW(page);
		await clearCGData(page);
		await clearSnapshotData(page);
	});

	test.afterEach(async ({ request }) => {
		await deleteTiddler(request, CG_TIDDLER_A).catch(() => {});
	});

	test("revert button appears in snapshot manager", async ({ page }) => {
		// Create a tiddler AND its "created-*" snapshot manually
		// (addTiddler bypasses th-saving-tiddler, so we must create the snapshot directly)
		await page.evaluate(() => {
			var storage = $tw.modules.execute("$:/plugins/rimir/minver/storage.js");
			var fields = { title: "MinverRevertTest", text: "new tiddler" };
			$tw.wiki.addTiddler(new $tw.Tiddler(fields));
			var serialized = storage.serializeTiddlerFields($tw.wiki.getTiddler("MinverRevertTest").fields);
			var snapshot = storage.createSnapshot("auto", "created-" + $tw.utils.stringifyDate(new Date()), serialized);
			var snapshots = storage.getSnapshotsFromStore($tw.wiki, "MinverRevertTest");
			snapshots.push(snapshot);
			storage.saveSnapshotsToStore($tw.wiki, "MinverRevertTest", snapshots);
		});
		await page.waitForTimeout(300);

		await openManager(page);

		// Find the entry for MinverRevertTest and expand it
		const entry = page.locator(".mv-manager-tiddler").filter({ hasText: "MinverRevertTest" });
		await expect(entry).toBeVisible();
		await entry.locator(".mv-manager-toggle").click();

		// Revert button (undo icon) should be visible in the expanded table
		await expect(entry.locator('[title="Revert tiddler to this snapshot"]')).toBeVisible();

		// Cleanup
		await page.evaluate(() => $tw.wiki.deleteTiddler("MinverRevertTest"));
	});

	test("revert created snapshot deletes the tiddler", async ({ page }) => {
		// Create a tiddler AND its "created-*" snapshot manually
		await page.evaluate(() => {
			var storage = $tw.modules.execute("$:/plugins/rimir/minver/storage.js");
			var fields = { title: "MinverRevertDelete", text: "to be reverted" };
			$tw.wiki.addTiddler(new $tw.Tiddler(fields));
			var serialized = storage.serializeTiddlerFields($tw.wiki.getTiddler("MinverRevertDelete").fields);
			var snapshot = storage.createSnapshot("auto", "created-" + $tw.utils.stringifyDate(new Date()), serialized);
			var snapshots = storage.getSnapshotsFromStore($tw.wiki, "MinverRevertDelete");
			snapshots.push(snapshot);
			storage.saveSnapshotsToStore($tw.wiki, "MinverRevertDelete", snapshots);
		});
		await page.waitForTimeout(300);

		// Verify tiddler exists
		const exists = await page.evaluate(() => !!$tw.wiki.getTiddler("MinverRevertDelete"));
		expect(exists).toBe(true);

		await openManager(page);

		// Expand the entry
		const entry = page.locator(".mv-manager-tiddler").filter({ hasText: "MinverRevertDelete" });
		await expect(entry).toBeVisible();
		await entry.locator(".mv-manager-toggle").click();

		// Verify the snapshot label contains "created-"
		await expect(entry.locator("td").filter({ hasText: "created-" })).toBeVisible();

		// Accept confirm dialog
		page.on("dialog", (dialog) => dialog.accept());

		// Click the revert button
		await entry.locator('[title="Revert tiddler to this snapshot"]').click();
		await page.waitForTimeout(500);

		// Tiddler should be deleted
		const existsAfter = await page.evaluate(() => !!$tw.wiki.getTiddler("MinverRevertDelete"));
		expect(existsAfter).toBe(false);
	});
});

// ===== 5. Auto-snapshot on create/delete =====

test.describe("minver auto-snapshot on create/delete", () => {
	test.beforeEach(async ({ page, request }) => {
		await page.goto("/");
		await waitForTW(page);
		await clearCGData(page);
		await clearSnapshotData(page);
	});

	test.afterEach(async ({ request }) => {
		await deleteTiddler(request, "MinverAutoCreate").catch(() => {});
		await deleteTiddler(request, "MinverAutoDelete").catch(() => {});
	});

	test("creating a tiddler produces created snapshot in manager", async ({ page }) => {
		// Create a draft tiddler directly and open it in the story river,
		// then save through the navigator which fires th-saving-tiddler
		await page.evaluate(() => {
			var draftTitle = "Draft of 'MinverAutoCreate'";
			$tw.wiki.addTiddler(new $tw.Tiddler({
				title: draftTitle,
				"draft.title": "MinverAutoCreate",
				"draft.of": "MinverAutoCreate",
				text: "hello world",
			}));
			var list = $tw.wiki.getTiddlerList("$:/StoryList");
			list = [draftTitle].concat(list);
			$tw.wiki.addTiddler({
				title: "$:/StoryList",
				text: "",
				list: $tw.utils.stringifyList(list),
			});
		});
		await page.waitForSelector('.tc-tiddler-frame[data-tiddler-title="Draft of \'MinverAutoCreate\'"]');

		await saveDraft(page, "MinverAutoCreate");
		await page.waitForTimeout(300);

		await openManager(page);

		// Should list the tiddler with at least one snapshot
		const entry = page.locator(".mv-manager-tiddler").filter({ hasText: "MinverAutoCreate" });
		await expect(entry).toBeVisible();

		// Expand and verify a "created-" snapshot exists
		await entry.locator(".mv-manager-toggle").click();
		await expect(entry.locator("td").filter({ hasText: "created-" })).toBeVisible();
	});

	test("deleting a tiddler produces deleted snapshot in manager", async ({ page, request }) => {
		// Create tiddler via API first (so it exists on disk)
		await createTiddler(request, "MinverAutoDelete", { text: "will be deleted" });

		// Reload to pick up the synced tiddler
		await page.reload();
		await waitForTW(page);
		await clearSnapshotData(page);
		await page.waitForTimeout(300);

		// Delete the tiddler — the deleteTiddler wrapper should create a "deleted-*" snapshot
		await page.evaluate(() => {
			$tw.wiki.deleteTiddler("MinverAutoDelete");
		});
		await page.waitForTimeout(300);

		await openManager(page);

		// Should list the tiddler with a "deleted-*" snapshot
		const entry = page.locator(".mv-manager-tiddler").filter({ hasText: "MinverAutoDelete" });
		await expect(entry).toBeVisible();

		// Expand and verify the label contains "deleted-"
		await entry.locator(".mv-manager-toggle").click();
		await expect(entry.locator("td").filter({ hasText: "deleted-" })).toBeVisible();
	});
});
