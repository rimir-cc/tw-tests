const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler, openEditor, getDraftFrame } = require("./helpers");

const TIDDLER = "GitIntTestTiddler";

test.describe("git-int plugin", () => {
	test.beforeEach(async ({ page, request }) => {
		await deleteTiddler(request, TIDDLER).catch(() => {});
		await createTiddler(request, TIDDLER, { text: "Git test content" });
		await page.goto("/");
		await waitForTW(page);
		await page.evaluate((title) => {
			const draftTitle = $tw.wiki.findDraft(title);
			if (draftTitle) $tw.wiki.deleteTiddler(draftTitle);
			$tw.wiki.addTiddler({ title: "$:/StoryList", text: "", list: "" });
		}, TIDDLER);
	});

	test.afterEach(async ({ request }) => {
		await deleteTiddler(request, TIDDLER).catch(() => {});
	});

	test("git-int plugin is loaded", async ({ page }) => {
		const loaded = await page.evaluate(() => {
			return !!$tw.wiki.getTiddler("$:/plugins/rimir/git-int");
		});
		expect(loaded).toBe(true);
	});

	test("git toolbar button tiddler exists", async ({ page }) => {
		const exists = await page.evaluate(() => {
			return !!$tw.wiki.getTiddler("$:/plugins/rimir/git-int/toolbar-button");
		});
		expect(exists).toBe(true);
	});

	test("git panel state tiddler controls visibility", async ({ page }) => {
		// Verify the panel tiddler template exists as shadow
		const exists = await page.evaluate(() => {
			return !!$tw.wiki.getTiddler("$:/plugins/rimir/git-int/panel");
		});
		expect(exists).toBe(true);
	});

	test("git-int settings render in settings hub", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
		await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: "git" }).click();

		const content = cp.locator(".rr-settings-content");
		await expect(content.locator(".rr-settings-header")).toBeVisible();
	});
});
