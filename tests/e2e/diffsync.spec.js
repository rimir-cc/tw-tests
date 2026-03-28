const { test, expect } = require("@playwright/test");
const {
	waitForTW,
	createTiddler,
	deleteTiddler,
	createTiddlerInBrowser,
	deleteTiddlerFromBrowser,
} = require("./helpers");

const SOURCE = "DiffsyncTestSource";
const TARGET = "DiffsyncTestTarget";

/**
 * Open the diffsync panel in the story river.
 */
async function openPanel(page) {
	await page.evaluate(() => {
		var list = $tw.utils.parseStringArray(
			$tw.wiki.getTiddlerText("$:/StoryList", "")
		);
		var target = "$:/plugins/rimir/diffsync/panel";
		if (list.indexOf(target) === -1) list = [target].concat(list);
		$tw.wiki.addTiddler({
			title: "$:/StoryList",
			text: "",
			list: $tw.utils.stringifyList(list),
		});
	});
	await page
		.locator('[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]')
		.waitFor();
}

/**
 * Select source and target tiddlers in the panel dropdowns.
 */
async function selectTiddlers(page, source, target) {
	const panel = page.locator(
		'[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]'
	);
	await panel.locator(".ds-picker").first().locator(".ds-select").selectOption(source);
	await panel.locator(".ds-picker").last().locator(".ds-select").selectOption(target);
}

/**
 * Click the Compare button in the panel.
 */
async function clickCompare(page) {
	const panel = page.locator(
		'[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]'
	);
	await panel.locator("button", { hasText: "Compare" }).click();
}

/**
 * Clean up diffsync temp/state tiddlers in the browser.
 */
async function clearDiffsyncState(page) {
	await page.evaluate(() => {
		var temps = $tw.wiki.filterTiddlers(
			"[prefix[$:/temp/diffsync/]] [prefix[$:/state/diffsync/]]"
		);
		temps.forEach(function (t) {
			$tw.wiki.deleteTiddler(t);
		});
	});
}

test.describe("diffsync basic comparison", () => {
	test.beforeEach(async ({ page, request }) => {
		await deleteTiddler(request, SOURCE).catch(() => {});
		await deleteTiddler(request, TARGET).catch(() => {});
		await page.goto("/");
		await waitForTW(page);
		await clearDiffsyncState(page);
	});

	test.afterEach(async ({ page, request }) => {
		await clearDiffsyncState(page);
		await deleteTiddler(request, SOURCE).catch(() => {});
		await deleteTiddler(request, TARGET).catch(() => {});
	});

	test("compares two tiddlers and shows field diffs", async ({
		page,
		request,
	}) => {
		await createTiddler(request, SOURCE, {
			text: "Hello world",
			tags: "alpha",
		});
		await createTiddler(request, TARGET, {
			text: "Hello universe",
			tags: "beta",
		});
		// Reload so syncer picks up new tiddlers
		await page.goto("/");
		await waitForTW(page);

		await openPanel(page);
		await selectTiddlers(page, SOURCE, TARGET);
		await clickCompare(page);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]'
		);
		// Should show field sections for differing fields
		await expect(panel.locator(".ds-field-section").first()).toBeVisible();
		// Should have at least text and tags differences
		const fieldNames = panel.locator(".ds-field-name");
		const count = await fieldNames.count();
		expect(count).toBeGreaterThanOrEqual(2);
	});

	test("shows no differences for identical tiddlers", async ({
		page,
		request,
	}) => {
		await createTiddler(request, SOURCE, {
			text: "Same content",
			tags: "same",
		});
		await createTiddler(request, TARGET, {
			text: "Same content",
			tags: "same",
		});
		await page.goto("/");
		await waitForTW(page);

		await openPanel(page);
		await selectTiddlers(page, SOURCE, TARGET);
		await clickCompare(page);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]'
		);
		await expect(panel.locator(".rr-status-info")).toContainText(
			"No differences"
		);
	});

	test("swap reverses source and target", async ({ page, request }) => {
		await createTiddler(request, SOURCE, { text: "Source text" });
		await createTiddler(request, TARGET, { text: "Target text" });
		await page.goto("/");
		await waitForTW(page);

		await openPanel(page);
		await selectTiddlers(page, SOURCE, TARGET);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]'
		);
		const sourceSelect = panel
			.locator(".ds-picker")
			.first()
			.locator(".ds-select");
		const targetSelect = panel
			.locator(".ds-picker")
			.last()
			.locator(".ds-select");

		// Verify initial state
		await expect(sourceSelect).toHaveValue(SOURCE);
		await expect(targetSelect).toHaveValue(TARGET);

		// Click swap
		await panel.locator("button", { hasText: "Swap" }).click();

		// Values should be reversed
		await expect(sourceSelect).toHaveValue(TARGET);
		await expect(targetSelect).toHaveValue(SOURCE);
	});
});

test.describe("diffsync selective sync", () => {
	test.beforeEach(async ({ page, request }) => {
		await deleteTiddler(request, SOURCE).catch(() => {});
		await deleteTiddler(request, TARGET).catch(() => {});
		await page.goto("/");
		await waitForTW(page);
		await clearDiffsyncState(page);
	});

	test.afterEach(async ({ page, request }) => {
		await clearDiffsyncState(page);
		await deleteTiddler(request, SOURCE).catch(() => {});
		await deleteTiddler(request, TARGET).catch(() => {});
	});

	test("toggle hunk changes visual state", async ({ page, request }) => {
		await createTiddler(request, SOURCE, {
			text: "line1\nline2\nline3\n",
		});
		await createTiddler(request, TARGET, {
			text: "line1\nchanged\nline3\n",
		});
		await page.goto("/");
		await waitForTW(page);

		await openPanel(page);
		await selectTiddlers(page, SOURCE, TARGET);
		await clickCompare(page);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]'
		);
		// Wait for hunk to appear
		const hunk = panel.locator(".ds-hunk").first();
		await expect(hunk).toBeVisible();

		// Initially should NOT have ds-hunk-source class
		await expect(hunk).not.toHaveClass(/ds-hunk-source/);

		// Click the "source" toggle button inside the hunk
		await hunk.locator(".ds-toggle-group button", { hasText: "source" }).click();

		// Now should have ds-hunk-source class
		await expect(hunk).toHaveClass(/ds-hunk-source/);
	});

	test("apply to target updates target tiddler", async ({
		page,
		request,
	}) => {
		await createTiddler(request, SOURCE, {
			text: "line1\nsource-line\nline3\n",
		});
		await createTiddler(request, TARGET, {
			text: "line1\ntarget-line\nline3\n",
		});
		await page.goto("/");
		await waitForTW(page);

		await openPanel(page);
		await selectTiddlers(page, SOURCE, TARGET);
		await clickCompare(page);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]'
		);

		// Toggle the hunk to "source"
		const hunk = panel.locator(".ds-hunk").first();
		await expect(hunk).toBeVisible();
		await hunk.locator(".ds-toggle-group button", { hasText: "source" }).click();

		// Click "Apply to target"
		await panel.locator("button", { hasText: "Apply to target" }).click();

		// Verify target tiddler now has source's text
		const targetText = await page.evaluate((title) => {
			var t = $tw.wiki.getTiddler(title);
			return t ? t.fields.text : null;
		}, TARGET);
		expect(targetText).toContain("source-line");
		expect(targetText).not.toContain("target-line");
	});

	test("single-line field toggle works", async ({ page, request }) => {
		await createTiddler(request, SOURCE, {
			text: "same",
			tags: "alpha",
		});
		await createTiddler(request, TARGET, {
			text: "same",
			tags: "beta",
		});
		await page.goto("/");
		await waitForTW(page);

		await openPanel(page);
		await selectTiddlers(page, SOURCE, TARGET);
		await clickCompare(page);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]'
		);

		// Find the tags field section — look for field header containing "tags"
		const fieldSections = panel.locator(".ds-field-section");
		const tagsSection = fieldSections.filter({
			has: page.locator(".ds-field-name", { hasText: "tags" }),
		});
		await expect(tagsSection).toBeVisible();

		// Toggle to "source"
		await tagsSection
			.locator(".ds-toggle-group button", { hasText: "source" })
			.click();

		// Apply to target
		await panel.locator("button", { hasText: "Apply to target" }).click();

		// Verify target now has source's tags
		const targetTags = await page.evaluate((title) => {
			var t = $tw.wiki.getTiddler(title);
			return t ? t.fields.tags : null;
		}, TARGET);
		expect(String(targetTags)).toContain("alpha");
	});
});

test.describe("diffsync multiline hunks", () => {
	test.beforeEach(async ({ page, request }) => {
		await deleteTiddler(request, SOURCE).catch(() => {});
		await deleteTiddler(request, TARGET).catch(() => {});
		await page.goto("/");
		await waitForTW(page);
		await clearDiffsyncState(page);
	});

	test.afterEach(async ({ page, request }) => {
		await clearDiffsyncState(page);
		await deleteTiddler(request, SOURCE).catch(() => {});
		await deleteTiddler(request, TARGET).catch(() => {});
	});

	test("multiline field shows hunks", async ({ page, request }) => {
		// Create tiddlers with multiple paragraphs that differ in two places
		const sourceText =
			"line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nline14\nline15\n";
		const targetText =
			"line1\nCHANGED2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10\nline11\nline12\nline13\nCHANGED14\nline15\n";
		await createTiddler(request, SOURCE, { text: sourceText });
		await createTiddler(request, TARGET, { text: targetText });
		await page.goto("/");
		await waitForTW(page);

		await openPanel(page);
		await selectTiddlers(page, SOURCE, TARGET);
		await clickCompare(page);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]'
		);
		// Should show multiple hunks — wait for at least 2
		const hunks = panel.locator(".ds-hunk");
		await expect(hunks).not.toHaveCount(0);
		await page.waitForTimeout(300);
		await expect(hunks).toHaveCount(2);
	});

	test("hunk context lines shown correctly", async ({ page, request }) => {
		await createTiddler(request, SOURCE, {
			text: "ctx1\nctx2\nctx3\nold\nctx4\nctx5\nctx6\n",
		});
		await createTiddler(request, TARGET, {
			text: "ctx1\nctx2\nctx3\nnew\nctx4\nctx5\nctx6\n",
		});
		await page.goto("/");
		await waitForTW(page);

		await openPanel(page);
		await selectTiddlers(page, SOURCE, TARGET);
		await clickCompare(page);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]'
		);
		// Verify context lines (equal type) appear around the change
		const equalLines = panel.locator(".ds-line-equal");
		const equalCount = await equalLines.count();
		expect(equalCount).toBeGreaterThan(0);

		// Verify delete and insert lines also present
		await expect(panel.locator(".ds-line-delete").first()).toBeVisible();
		await expect(panel.locator(".ds-line-insert").first()).toBeVisible();
	});
});

/**
 * Open the diffsync review panel in the story river.
 */
async function openReviewPanel(page) {
	await page.evaluate(() => {
		var list = $tw.utils.parseStringArray(
			$tw.wiki.getTiddlerText("$:/StoryList", "")
		);
		var target = "$:/plugins/rimir/diffsync/review";
		if (list.indexOf(target) === -1) list = [target].concat(list);
		$tw.wiki.addTiddler({
			title: "$:/StoryList",
			text: "",
			list: $tw.utils.stringifyList(list),
		});
	});
	await page
		.locator('[data-tiddler-title="$:/plugins/rimir/diffsync/review"]')
		.waitFor();
}

/**
 * Select source and target in the review panel and click "Review changes".
 */
async function selectAndReview(page, source, target) {
	const panel = page.locator(
		'[data-tiddler-title="$:/plugins/rimir/diffsync/review"]'
	);
	await panel
		.locator(".ds-picker")
		.first()
		.locator(".ds-select")
		.selectOption(source);
	await panel
		.locator(".ds-picker")
		.last()
		.locator(".ds-select")
		.selectOption(target);
	await panel.locator("button", { hasText: "Review changes" }).click();
	await page.waitForTimeout(300);
}

test.describe("diffsync review mode", () => {
	test.beforeEach(async ({ page, request }) => {
		await deleteTiddler(request, SOURCE).catch(() => {});
		await deleteTiddler(request, TARGET).catch(() => {});
		await page.goto("/");
		await waitForTW(page);
		await clearDiffsyncState(page);
	});

	test.afterEach(async ({ page, request }) => {
		await clearDiffsyncState(page);
		await deleteTiddler(request, SOURCE).catch(() => {});
		await deleteTiddler(request, TARGET).catch(() => {});
	});

	test("review mode shows changes as accepted by default", async ({
		page,
		request,
	}) => {
		await createTiddler(request, SOURCE, {
			text: "line1\nline2\nline3\n",
		});
		await createTiddler(request, TARGET, {
			text: "line1\nchanged\nline3\n",
		});
		await page.goto("/");
		await waitForTW(page);

		await openReviewPanel(page);
		await selectAndReview(page, SOURCE, TARGET);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/review"]'
		);
		// Hunks should have ds-hunk-accepted class by default
		const hunk = panel.locator(".ds-hunk").first();
		await expect(hunk).toBeVisible();
		await expect(hunk).toHaveClass(/ds-hunk-accepted/);
		await expect(hunk).not.toHaveClass(/ds-hunk-skipped/);

		// "Skip" button should be visible (since accepted by default)
		await expect(
			hunk.locator("button", { hasText: "Skip" })
		).toBeVisible();
	});

	test("skip button toggles hunk to skipped state", async ({
		page,
		request,
	}) => {
		await createTiddler(request, SOURCE, {
			text: "line1\nline2\nline3\n",
		});
		await createTiddler(request, TARGET, {
			text: "line1\nchanged\nline3\n",
		});
		await page.goto("/");
		await waitForTW(page);

		await openReviewPanel(page);
		await selectAndReview(page, SOURCE, TARGET);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/review"]'
		);
		const hunk = panel.locator(".ds-hunk").first();
		await expect(hunk).toBeVisible();

		// Click "Skip" on the hunk
		await hunk.locator("button", { hasText: "Skip" }).click();

		// Hunk should now have ds-hunk-skipped class
		await expect(hunk).toHaveClass(/ds-hunk-skipped/);
		await expect(hunk).not.toHaveClass(/ds-hunk-accepted/);

		// "Accept" button should now be visible
		await expect(
			hunk.locator("button", { hasText: "Accept" })
		).toBeVisible();
	});

	test("apply accepted changes updates original tiddler", async ({
		page,
		request,
	}) => {
		await createTiddler(request, SOURCE, { text: "original line\n" });
		await createTiddler(request, TARGET, { text: "changed line\n" });
		await page.goto("/");
		await waitForTW(page);

		await openReviewPanel(page);
		await selectAndReview(page, SOURCE, TARGET);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/review"]'
		);
		// All hunks accepted by default — click "Apply accepted changes to original"
		await panel
			.locator("button", { hasText: "Apply accepted changes to original" })
			.click();

		// Verify SOURCE tiddler now has "changed line\n"
		const sourceText = await page.evaluate((title) => {
			var t = $tw.wiki.getTiddler(title);
			return t ? t.fields.text : null;
		}, SOURCE);
		expect(sourceText).toContain("changed line");
		expect(sourceText).not.toContain("original line");
	});
});

test.describe("diffsync auto-refresh", () => {
	test.beforeEach(async ({ page, request }) => {
		await deleteTiddler(request, SOURCE).catch(() => {});
		await deleteTiddler(request, TARGET).catch(() => {});
		await page.goto("/");
		await waitForTW(page);
		await clearDiffsyncState(page);
	});

	test.afterEach(async ({ page, request }) => {
		await clearDiffsyncState(page);
		await deleteTiddler(request, SOURCE).catch(() => {});
		await deleteTiddler(request, TARGET).catch(() => {});
	});

	test("diff updates when source tiddler is edited", async ({
		page,
		request,
	}) => {
		await createTiddler(request, SOURCE, {
			text: "alpha content",
			tags: "test",
		});
		await createTiddler(request, TARGET, {
			text: "beta content",
			tags: "test",
		});
		await page.goto("/");
		await waitForTW(page);

		await openPanel(page);
		await selectTiddlers(page, SOURCE, TARGET);
		await clickCompare(page);

		const panel = page.locator(
			'[data-tiddler-title="$:/plugins/rimir/diffsync/panel"]'
		);
		// Should show field sections for differing fields (text differs)
		await expect(panel.locator(".ds-field-section").first()).toBeVisible();
		const initialCount = await panel.locator(".ds-field-section").count();

		// A "text" field name should appear in the diff
		await expect(
			panel.locator(".ds-field-name", { hasText: "text" })
		).toBeVisible();

		// Edit SOURCE text to match TARGET text
		await page.evaluate(
			({ source, target }) => {
				var targetTiddler = $tw.wiki.getTiddler(target);
				if (targetTiddler) {
					$tw.wiki.addTiddler(
						new $tw.Tiddler(
							$tw.wiki.getTiddler(source),
							{ text: targetTiddler.fields.text }
						)
					);
				}
			},
			{ source: SOURCE, target: TARGET }
		);

		// Re-compare to pick up the change
		await clickCompare(page);
		await page.waitForTimeout(300);

		// The "text" field should no longer appear in the diff
		await expect(
			panel.locator(".ds-field-name", { hasText: "text" })
		).not.toBeVisible();

		// Field section count should have decreased
		const newCount = await panel.locator(".ds-field-section").count();
		expect(newCount).toBeLessThan(initialCount);
	});
});
