const { test, expect } = require("@playwright/test");
const { waitForTW } = require("./helpers");

// Keyboard navigation in kind's ref field dropdown (field-input.tid), tested in the
// graph-modal create form. Fixtures can't live under $:/temp/ (kind does not count
// tiddlers there as instances); the sweep deletes them before and after each test.
const P = "$:/test/krd/";
const GM = "$:/state/rimir/kind/graph-modal";
const DRAFT = GM + "/draft";

const FIELDS = {
	"krd-person": [{ key: "caption", typed: "text" }],
	"krd-team": [{ key: "members", typed: "ref", cardinality: "multi", "ref-types": ["krd-person"] }],
	"krd-task": [
		{ key: "caption", typed: "text" },
		{ key: "people", typed: "ref", cardinality: "multi", "ref-types": ["krd-person"] },
	],
};

async function sweep(page) {
	await page.evaluate(({ P, GM, DRAFT }) => {
		$tw.wiki.filterTiddlers(`[prefix[${P}]] [prefix[$:/state/rimir/kind/ta/${DRAFT}]]`).forEach((t) => $tw.wiki.deleteTiddler(t));
		[GM, DRAFT].forEach((t) => $tw.wiki.deleteTiddler(t));
	}, { P, GM, DRAFT });
}

async function setup(page) {
	await page.evaluate(({ P, FIELDS }) => {
		Object.keys(FIELDS).forEach((key) => $tw.wiki.addTiddler(new $tw.Tiddler({
			title: P + "type/" + key, "kind.type": key, "kind.fields": JSON.stringify(FIELDS[key]),
			...(key === "krd-team" ? { "kind.group-of": "members" } : {}),
		})));
		[["Anna", "krd-person"], ["Ann-Kathrin", "krd-person"], ["Ben", "krd-person"]].forEach(([n, k]) =>
			$tw.wiki.addTiddler(new $tw.Tiddler({ title: P + n, "kind.type": k })));
		$tw.wiki.addTiddler(new $tw.Tiddler({ title: P + "Annex team", "kind.type": "krd-team", members: `[[${P}Ben]]` }));
		$tw.rootWidget.invokeActionString(`\\import $:/plugins/rimir/kind/engine\n<$transclude $variable="kind.gm-create" type-tid="${P}type/krd-task"/>`);
	}, { P, FIELDS });
	await expect(page.locator(".kind-graph-modal-panel")).toBeVisible();
}

const search = (page) => page.locator(".kind-graph-modal-panel .kind-ref-search input");
const rows = (page) => page.locator(".kind-graph-modal-panel .kind-dropdown-item");
const people = (page) => page.evaluate((d) => $tw.wiki.getTiddlerList(d, "people"), DRAFT);
const searchFocused = (page) => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest(".kind-ref-search"));

test.describe("kind ref dropdown", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		await sweep(page);
		await setup(page);
	});

	test.afterEach(async ({ page }) => {
		await sweep(page);
	});

	test("arrows move the highlight without losing the cursor, Enter links", async ({ page }) => {
		await search(page).click();
		await search(page).pressSequentially("Ann");
		await expect(rows(page)).toHaveCount(3);
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		await expect(rows(page).nth(1)).toHaveClass(/kind-dropdown-hi/);
		expect(await searchFocused(page)).toBe(true);
		await page.keyboard.press("ArrowUp");
		await expect(rows(page).nth(0)).toHaveClass(/kind-dropdown-hi/);
		const first = (await rows(page).nth(0).innerText()).trim();
		await page.keyboard.press("Enter");
		await expect(rows(page)).toHaveCount(0);
		expect(await people(page)).toEqual([first]);
		expect(await searchFocused(page)).toBe(true);
		// keep going without the mouse: a second person
		await page.keyboard.type("Ben");
		await page.keyboard.press("Enter");
		expect(await people(page)).toEqual([first, P + "Ben"]);
	});

	test("typing resets the highlight; Enter on a group adds its members", async ({ page }) => {
		await search(page).click();
		await search(page).pressSequentially("An");
		await page.keyboard.press("ArrowDown");
		await search(page).pressSequentially("n");
		await expect(page.locator(".kind-graph-modal-panel .kind-dropdown-hi")).toHaveCount(0);
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		await expect(rows(page).nth(2)).toHaveClass(/kind-dropdown-group/);
		await expect(rows(page).nth(2)).toHaveClass(/kind-dropdown-hi/);
		await page.keyboard.press("Enter");
		expect(await people(page)).toEqual([P + "Ben"]);
	});

	test("Esc clears the search first, a second Esc closes the modal", async ({ page }) => {
		await search(page).click();
		await search(page).pressSequentially("Ann");
		await page.keyboard.press("Escape");
		await expect(rows(page)).toHaveCount(0);
		await expect(page.locator(".kind-graph-modal-panel")).toBeVisible();
		await expect(search(page)).toHaveValue("");
		await search(page).focus();
		await page.keyboard.press("Escape");
		await expect(page.locator(".kind-graph-modal-panel")).toHaveCount(0);
	});
});
