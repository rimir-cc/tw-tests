/**
 * Shared helpers for TiddlyWiki Playwright tests.
 */

/**
 * Wait for TW to fully load (story river rendered).
 */
async function waitForTW(page) {
	await page.waitForSelector(".tc-story-river", { timeout: 10000 });
}

/**
 * Create a new tiddler via TW's HTTP API (PUT).
 */
async function createTiddler(request, title, fields = {}) {
	const body = {
		title,
		text: fields.text || "",
		tags: fields.tags || "",
		...fields,
	};
	await request.put(`/recipes/default/tiddlers/${encodeURIComponent(title)}`, {
		headers: {
			"Content-Type": "application/json",
			"X-Requested-With": "TiddlyWiki",
		},
		data: body,
	});
	return title;
}

/**
 * Delete a tiddler via TW's HTTP API.
 */
async function deleteTiddler(request, title) {
	await request.delete(`/bags/default/tiddlers/${encodeURIComponent(title)}`, {
		headers: { "X-Requested-With": "TiddlyWiki" },
	});
}

/**
 * Navigate to a tiddler in the story river.
 */
async function navigateToTiddler(page, title) {
	await page.evaluate((t) => {
		var storyList = $tw.wiki.getTiddlerList("$:/StoryList");
		if (storyList.indexOf(t) === -1) {
			storyList = [t].concat(storyList);
			$tw.wiki.addTiddler({
				title: "$:/StoryList",
				text: "",
				list: $tw.utils.stringifyList(storyList),
			});
		}
	}, title);
	const escaped = title.replace(/"/g, '\\"');
	await page.waitForSelector(`.tc-tiddler-frame[data-tiddler-title="${escaped}"]`);
}

/**
 * Open the editor for a tiddler (click the edit button).
 */
async function openEditor(page, title) {
	const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${title}"]`).first();
	await frame.locator('button[aria-label="Edit this tiddler"]').click();
	await page.waitForSelector(`.tc-tiddler-frame[data-tiddler-title="Draft of '${title}'"]`);
}

/**
 * Get the draft frame locator for a tiddler.
 */
function getDraftFrame(page, title) {
	return page.locator(`.tc-tiddler-frame[data-tiddler-title="Draft of '${title}'"]`);
}

/**
 * Switch the editor preview to the "snapshots" tab (minver).
 */
async function openSnapshotPreview(page, title) {
	const draft = getDraftFrame(page, title);
	// Open preview pane (first match — body editor toolbar, not tag/field toolbars)
	await draft.locator('button[title*="preview pane"]').first().click();
	// Open preview type dropdown
	await draft.locator('button[title="Choose preview type"]').first().click();
	// Click "snapshots" in the dropdown
	await page.locator(".tc-drop-down button, .tc-drop-down a").filter({ hasText: "snapshots" }).click();
	// Wait for minver UI
	await draft.locator(".mv-toolbar").waitFor();
}

/**
 * Save a draft (click done/confirm).
 */
async function saveDraft(page, title) {
	const draft = getDraftFrame(page, title);
	await draft.locator('button[aria-label="Confirm changes to this tiddler"]').click();
	await page.waitForSelector(`.tc-tiddler-frame[data-tiddler-title="${title}"]:not([data-tiddler-title*="Draft"])`);
}

/**
 * Create a tiddler directly in the browser wiki store (instant, no sync delay).
 * Use this when the tiddler must be renderable immediately after creation.
 */
async function createTiddlerInBrowser(page, title, fields = {}) {
	await page.evaluate(({ title, fields }) => {
		$tw.wiki.addTiddler(new $tw.Tiddler({ title, ...fields }));
	}, { title, fields });
}

/**
 * Delete a tiddler from browser wiki store.
 */
async function deleteTiddlerFromBrowser(page, title) {
	await page.evaluate((t) => $tw.wiki.deleteTiddler(t), title);
}

module.exports = {
	waitForTW,
	createTiddler,
	deleteTiddler,
	navigateToTiddler,
	openEditor,
	getDraftFrame,
	openSnapshotPreview,
	saveDraft,
	createTiddlerInBrowser,
	deleteTiddlerFromBrowser,
};
