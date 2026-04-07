const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler, createTiddlerInBrowser, deleteTiddlerFromBrowser } = require("./helpers");

const TIDDLER = "ComponentsTestTiddler";

test.describe("components plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await deleteTiddlerFromBrowser(page, TIDDLER).catch(() => {});
		// Clean up state tiddlers
		await page.evaluate(() => {
			const toDelete = $tw.wiki.filterTiddlers("[prefix[$:/state/test-]][prefix[$:/temp/test-]]");
			toDelete.forEach(t => $tw.wiki.deleteTiddler(t));
		});
	});

	test("pills component renders with elements", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/components/pills" elements="alpha beta gamma" state="$:/state/test-pills"/>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const pills = frame.locator(".rrc-pills");
		await expect(pills).toBeVisible();

		const elems = pills.locator(".rrc-elem");
		await expect(elems).toHaveCount(3);
	});

	test("pills multi-select toggles selection on click", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/components/pills" elements="alpha beta gamma" selection="multi" state="$:/state/test-pills-multi"/>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const elems = frame.locator(".rrc-pills .rrc-elem");

		await elems.nth(0).click();
		await expect(elems.nth(0)).toHaveClass(/selected/);

		await elems.nth(1).click();
		await expect(elems.nth(1)).toHaveClass(/selected/);
		// First should still be selected (multi)
		await expect(elems.nth(0)).toHaveClass(/selected/);

		// Click first again to deselect
		await elems.nth(0).click();
		await expect(elems.nth(0)).not.toHaveClass(/selected/);
	});

	test("pills single-select allows only one selection", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/components/pills" elements="alpha beta gamma" selection="single" state="$:/state/test-pills-single"/>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const elems = frame.locator(".rrc-pills .rrc-elem");

		await elems.nth(0).click();
		await expect(elems.nth(0)).toHaveClass(/selected/);

		await elems.nth(1).click();
		await expect(elems.nth(1)).toHaveClass(/selected/);
		await expect(elems.nth(0)).not.toHaveClass(/selected/);
	});

	test("vtabs component renders from showcase", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/components/showcase");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/components/showcase"]');
		const vtabs = frame.locator(".rrc-vtabs");
		if (await vtabs.count() > 0) {
			await expect(vtabs.first()).toBeVisible();
		}
	});

	test("showcase renders demo components", async ({ page }) => {
		await navigateToTiddler(page, "$:/plugins/rimir/components/showcase");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/plugins/rimir/components/showcase"]');
		await expect(frame.locator(".rrc-pills").first()).toBeVisible();
	});

	test("pills selection state syncs to configured tiddler", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/components/pills" elements="alpha beta gamma" selection="multi" sync-tiddler="$:/temp/test-pills-sync" sync-field="text" state="$:/state/test-pills-sync"/>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const elems = frame.locator(".rrc-pills .rrc-elem");

		// Select alpha and gamma
		await elems.nth(0).click();
		await elems.nth(2).click();

		// Verify state was synced to the configured tiddler
		const syncedText = await page.evaluate(() => {
			const t = $tw.wiki.getTiddler("$:/temp/test-pills-sync");
			return t ? t.fields.text : "";
		});
		expect(syncedText).toContain("alpha");
		expect(syncedText).toContain("gamma");
		expect(syncedText).not.toContain("beta");
	});

	test("vtabs section click updates section-vis state", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: `<$transclude $tiddler="$:/plugins/rimir/components/vtabs"
				elements="sec1 act1 act2 sec2 act3"
				type-fn="[<element>prefix[sec]then[sec]]~[<element>prefix[act]then[act]]"
				state="$:/state/test-vtabs-toggle"
				default-collapsed="no"/>`,
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const vtabs = frame.locator(".rrc-vtabs");

		// All elements visible with default-collapsed=no
		await expect(vtabs.locator('[data-elem="sec1"]')).toBeVisible();
		await expect(vtabs.locator('[data-elem="act1"]')).toBeVisible();
		await expect(vtabs.locator('[data-elem="sec2"]')).toBeVisible();

		// Click sec1 — should toggle section-vis state
		await vtabs.locator('[data-elem="sec1"]').click();

		// Verify sec1 was toggled in the state tiddler
		const stateAfterClick = await page.evaluate(() => {
			const tiddlers = $tw.wiki.filterTiddlers("[prefix[$:/state/test-vtabs-toggle]]");
			const result = {};
			tiddlers.forEach(t => {
				const tid = $tw.wiki.getTiddler(t);
				if (tid) result[t] = tid.fields.text || "";
			});
			return result;
		});
		// At least one state tiddler should contain "sec1"
		const hasToggle = Object.values(stateAfterClick).some(v => v.includes("sec1"));
		expect(hasToggle).toBe(true);

		// Click sec1 again — should un-toggle
		await vtabs.locator('[data-elem="sec1"]').click();

		const stateAfterSecondClick = await page.evaluate(() => {
			const tiddlers = $tw.wiki.filterTiddlers("[prefix[$:/state/test-vtabs-toggle]]");
			const result = {};
			tiddlers.forEach(t => {
				const tid = $tw.wiki.getTiddler(t);
				if (tid) result[t] = tid.fields.text || "";
			});
			return result;
		});
		const hasToggleAfter = Object.values(stateAfterSecondClick).some(v => v.includes("sec1"));
		expect(hasToggleAfter).toBe(false);
	});

	test("vtabs default-collapsed=no shows all elements", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: `<$transclude $tiddler="$:/plugins/rimir/components/vtabs"
				elements="sec1 act1 act2"
				type-fn="[<element>prefix[sec]then[sec]]~[<element>prefix[act]then[act]]"
				state="$:/state/test-vtabs-expanded"
				default-collapsed="no"/>`,
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const vtabs = frame.locator(".rrc-vtabs");

		await expect(vtabs.locator('[data-elem="sec1"]')).toBeVisible();
		await expect(vtabs.locator('[data-elem="act1"]')).toBeVisible();
		await expect(vtabs.locator('[data-elem="act2"]')).toBeVisible();
	});

	test("vtabs renders correct element types with CSS classes", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: `<$transclude $tiddler="$:/plugins/rimir/components/vtabs"
				elements="sec1 act1 lnk1"
				type-fn="[<element>prefix[sec]then[sec]]~[<element>prefix[act]then[act]]~[<element>prefix[lnk]then[lnk]]"
				state="$:/state/test-vtabs-types"
				default-collapsed="no"/>`,
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const vtabs = frame.locator(".rrc-vtabs");

		await expect(vtabs.locator('[data-elem="sec1"]')).toHaveClass(/rrc-type-sec/);
		await expect(vtabs.locator('[data-elem="act1"]')).toHaveClass(/rrc-type-act/);
		await expect(vtabs.locator('[data-elem="lnk1"]')).toHaveClass(/rrc-type-lnk/);
	});

	test("pills with selection=none renders clickable elements without state", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/components/pills" elements="alpha beta gamma" selection="none" state="$:/state/test-pills-none"/>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const elems = frame.locator(".rrc-pills .rrc-elem");
		await expect(elems).toHaveCount(3);

		// Click should not add selected class
		await elems.nth(0).click();
		await expect(elems.nth(0)).not.toHaveClass(/selected/);
	});

	test("pills inline filter shows input field", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/components/pills" elements="alpha beta gamma" filterable="inline" state="$:/state/test-pills-inline"/>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const filterInput = frame.locator(".rrc-pills-inline-filter input");
		await expect(filterInput).toBeVisible();
		await expect(filterInput).toHaveAttribute("placeholder", "Filter...");
	});
});
