/**
 * E2E tests for the rimir/namespace plugin — verifies that the parser
 * rule, filter operators, and resolver work end-to-end in a real
 * browser. Jasmine specs cover the resolver internals; these tests
 * cover the seams the unit tests can't reach: actual DOM rendering of
 * [[REF]], CSS class application for unresolved refs, navigation, and
 * the \context pragma in a rendered tiddler.
 */

const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddlerInBrowser, navigateToTiddler, deleteTiddlerFromBrowser } = require("./helpers");

test.describe("namespace plugin", () => {

	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await page.evaluate(() => {
			const toDelete = $tw.wiki.filterTiddlers("[prefix[ns-pw/]]");
			toDelete.forEach(t => $tw.wiki.deleteTiddler(t));
			$tw.wiki.addTiddler({ title: "$:/StoryList", text: "", list: "" });
		});
	});

	test("[[REF]] resolves via walk-up and renders as a normal link", async ({ page }) => {
		await createTiddlerInBrowser(page, "ns-pw/a/b/Target", { text: "I am the target" });
		await createTiddlerInBrowser(page, "ns-pw/a/b/Source", { text: "Link to [[Target]]" });
		await navigateToTiddler(page, "ns-pw/a/b/Source");

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/a/b/Source"]`);
		// The link should render as a resolved tiddlylink (not unresolved).
		const link = frame.locator("a.tc-tiddlylink").filter({ hasText: "Target" });
		await expect(link).toBeVisible();
		await expect(link).toHaveClass(/ns-resolved/);
		await expect(link).not.toHaveClass(/ns-unresolved/);
	});

	test("missing ref renders with ns-unresolved class", async ({ page }) => {
		await createTiddlerInBrowser(page, "ns-pw/a/Source", { text: "Link to [[NoSuchThing]]" });
		await navigateToTiddler(page, "ns-pw/a/Source");

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/a/Source"]`);
		const link = frame.locator("a.tc-tiddlylink").filter({ hasText: "NoSuchThing" });
		await expect(link).toBeVisible();
		await expect(link).toHaveClass(/ns-unresolved/);
	});

	test("absolute ref [[a/b/c]] resolves literally", async ({ page }) => {
		await createTiddlerInBrowser(page, "ns-pw/a/b/Target", { text: "" });
		await createTiddlerInBrowser(page, "ns-pw/Source", { text: "Click [[ns-pw/a/b/Target]]" });
		await navigateToTiddler(page, "ns-pw/Source");

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/Source"]`);
		const link = frame.locator("a.tc-tiddlylink").filter({ hasText: "ns-pw/a/b/Target" });
		await expect(link).toHaveClass(/ns-resolved/);
	});

	test("$:/ system tiddler resolves literally (shadow tiddler)", async ({ page }) => {
		await createTiddlerInBrowser(page, "ns-pw/Source", { text: "[[$:/ControlPanel]]" });
		await navigateToTiddler(page, "ns-pw/Source");

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/Source"]`);
		const link = frame.locator("a.tc-tiddlylink").filter({ hasText: "$:/ControlPanel" });
		await expect(link).toHaveClass(/ns-resolved/);
	});

	test("[[text|target]] form renders link text and resolves target", async ({ page }) => {
		await createTiddlerInBrowser(page, "ns-pw/a/Real", { text: "" });
		await createTiddlerInBrowser(page, "ns-pw/a/Source", { text: "Click [[here|Real]]" });
		await navigateToTiddler(page, "ns-pw/a/Source");

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/a/Source"]`);
		const link = frame.locator("a.tc-tiddlylink").filter({ hasText: "here" });
		await expect(link).toBeVisible();
		await expect(link).toHaveClass(/ns-resolved/);
	});

	test("clicking a walk-up resolved link navigates to the actual target", async ({ page }) => {
		await createTiddlerInBrowser(page, "ns-pw/x/y/Goal", { text: "destination" });
		await createTiddlerInBrowser(page, "ns-pw/x/y/Start", { text: "Go to [[Goal]]" });
		await navigateToTiddler(page, "ns-pw/x/y/Start");

		const startFrame = page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/x/y/Start"]`);
		await startFrame.locator("a.tc-tiddlylink").filter({ hasText: "Goal" }).click();

		// Goal tiddler should now appear in the story river.
		await expect(page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/x/y/Goal"]`)).toBeVisible();
	});

	test("\\context pragma rewrites bare refs to <prefix>/REF", async ({ page }) => {
		await createTiddlerInBrowser(page, "ns-pw/ctx/Target", { text: "ctx target" });
		await createTiddlerInBrowser(page, "ns-pw/Standalone", {
			text: "\\context ns-pw/ctx\n\nLink: [[Target]]",
		});
		await navigateToTiddler(page, "ns-pw/Standalone");

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/Standalone"]`);
		const link = frame.locator("a.tc-tiddlylink").filter({ hasText: "Target" });
		await expect(link).toBeVisible();
		await expect(link).toHaveClass(/ns-resolved/);
	});

	test("context field on source tiddler resolves bare refs", async ({ page }) => {
		await createTiddlerInBrowser(page, "ns-pw/ctxf/Target", { text: "" });
		await createTiddlerInBrowser(page, "ns-pw/CtxFieldSource", {
			text: "[[Target]]",
			context: "ns-pw/ctxf",
		});
		await navigateToTiddler(page, "ns-pw/CtxFieldSource");

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/CtxFieldSource"]`);
		const link = frame.locator("a.tc-tiddlylink").filter({ hasText: "Target" });
		await expect(link).toHaveClass(/ns-resolved/);
	});

	test("alias rewrites short ref to long target", async ({ page }) => {
		await createTiddlerInBrowser(page, "ns-pw/AliasReal", { text: "" });
		await createTiddlerInBrowser(page, "ns-pw/alias-def", {
			tags: "$:/tags/NamespaceAlias",
			"short": "PWALI",
			"expands-to": "ns-pw/AliasReal",
		});
		await createTiddlerInBrowser(page, "ns-pw/AliasSource", { text: "Use [[PWALI]]" });
		await navigateToTiddler(page, "ns-pw/AliasSource");

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/AliasSource"]`);
		const link = frame.locator("a.tc-tiddlylink").filter({ hasText: "PWALI" });
		await expect(link).toHaveClass(/ns-resolved/);
	});

	test("_latest pseudo expands to the highest-version child", async ({ page }) => {
		await createTiddlerInBrowser(page, "ns-pw/v/3.0/X", { text: "" });
		await createTiddlerInBrowser(page, "ns-pw/v/4.0/X", { text: "" });
		await createTiddlerInBrowser(page, "ns-pw/LatestSource", { text: "Get [[ns-pw/v/_latest/X]]" });

		// Trigger pseudo cache rebuild against the current wiki state.
		await page.evaluate(() => {
			$tw.modules.execute("$:/plugins/rimir/namespace/resolver.js").invalidatePseudoCache();
		});
		await navigateToTiddler(page, "ns-pw/LatestSource");

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/LatestSource"]`);
		const link = frame.locator("a.tc-tiddlylink");
		// Resolved class confirms the resolver matched something.
		await expect(link).toHaveClass(/ns-resolved/);
		// Click and confirm we land on the 4.0 (highest) variant, not 3.0.
		await link.click();
		await expect(page.locator(`.tc-tiddler-frame[data-tiddler-title="ns-pw/v/4.0/X"]`)).toBeVisible();
	});

});
