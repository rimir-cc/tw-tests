const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler, createTiddlerInBrowser, deleteTiddlerFromBrowser } = require("./helpers");

const TIDDLER = "StatewrapTestTiddler";

test.describe("statewrap plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await deleteTiddlerFromBrowser(page, TIDDLER).catch(() => {});
		await page.evaluate(() => {
			$tw.wiki.filterTiddlers("[prefix[$:/state/rimir/statewrap/sw-test]]").forEach(t =>
				$tw.wiki.deleteTiddler(t)
			);
		}).catch(() => {});
	});

	test("statewrap initializes channels with defaults in browser", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$statewrap channels="tab mode" default-tab="overview" default-mode="read" instid="sw-test-init"></$statewrap>',
		});
		await navigateToTiddler(page, TIDDLER);

		const state = await page.evaluate(() => {
			const tab = $tw.wiki.getTiddler("$:/state/rimir/statewrap/sw-test-init/tab");
			const mode = $tw.wiki.getTiddler("$:/state/rimir/statewrap/sw-test-init/mode");
			return {
				tabValue: tab ? tab.fields.text : null,
				modeValue: mode ? mode.fields.text : null,
			};
		});
		expect(state.tabValue).toBe("overview");
		expect(state.modeValue).toBe("read");
	});

	test("action-statewrap-set writes channel value via button click", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: [
				'<$statewrap channels="selected" instid="sw-test-click">',
				'<$button class="sw-test-btn">',
				'<$action-statewrap-set channel="selected" value="clicked"/>',
				'Click me',
				'</$button>',
				'Value: <$text text={{{ [statewrap-get[selected]] }}}/>',
				'</$statewrap>',
			].join("\n"),
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		await frame.locator(".sw-test-btn").click();

		// Verify the value was written
		const value = await page.evaluate(() => {
			const t = $tw.wiki.getTiddler("$:/state/rimir/statewrap/sw-test-click/selected");
			return t ? t.fields.text : null;
		});
		expect(value).toBe("clicked");

		// Verify the display updated
		await expect(frame.locator("text=Value: clicked")).toBeVisible();
	});

	test("reactive rule fires on channel change", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: [
				'<$statewrap channels="project task" instid="sw-test-rule">',
				'<$statewrap-rule when="project">',
				'<$action-statewrap-set channel="task" value=""/>',
				'</$statewrap-rule>',
				'<$button class="sw-set-project">',
				'<$action-statewrap-set channel="project" value="Alpha"/>',
				'Set Project',
				'</$button>',
				'Task: <$text text={{{ [statewrap-get[task]] }}}/>',
				'</$statewrap>',
			].join("\n"),
		});
		await navigateToTiddler(page, TIDDLER);

		// Pre-set task to verify it gets cleared by the rule
		await page.evaluate(() => {
			$tw.wiki.setText("$:/state/rimir/statewrap/sw-test-rule/task", "text", null, "existing-task");
		});

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		await frame.locator(".sw-set-project").click();

		// Rule should have cleared the task
		const state = await page.evaluate(() => {
			return {
				project: $tw.wiki.getTiddlerText("$:/state/rimir/statewrap/sw-test-rule/project"),
				task: $tw.wiki.getTiddlerText("$:/state/rimir/statewrap/sw-test-rule/task"),
			};
		});
		expect(state.project).toBe("Alpha");
		expect(state.task).toBe("");
	});

	test("statewrap-ref filter operator returns state tiddler path", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: [
				'<$statewrap channels="tab" instid="sw-test-ref" default-tab="info">',
				'<$reveal stateTitle={{{ [statewrap-ref[tab]] }}} type="match" text="info">',
				'<span class="sw-info-visible">Info tab content</span>',
				'</$reveal>',
				'</$statewrap>',
			].join("\n"),
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		await expect(frame.locator(".sw-info-visible")).toBeVisible();
	});

	test("instance isolation via different instid", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: [
				'<$statewrap channels="val" instid="sw-test-iso-a" default-val="A">',
				'<span class="sw-val-a"><$text text={{{ [statewrap-get[val]] }}}/></span>',
				'</$statewrap>',
				'<$statewrap channels="val" instid="sw-test-iso-b" default-val="B">',
				'<span class="sw-val-b"><$text text={{{ [statewrap-get[val]] }}}/></span>',
				'</$statewrap>',
			].join("\n"),
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		await expect(frame.locator(".sw-val-a")).toHaveText("A");
		await expect(frame.locator(".sw-val-b")).toHaveText("B");
	});

	test("showcase renders without errors", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/statewrap/showcase");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/statewrap/showcase"]');
		await expect(frame.locator("text=Selected project")).toBeVisible();
	});
});
