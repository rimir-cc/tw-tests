const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler, wakeOutline } = require("./helpers");

// Outline ranges (Shift-Up/Down, Shift-Click) and Externalize. Tiddlers are named "OLR <test title>".

function frameOf(page, title) {
	return page.locator(`.tc-tiddler-frame[data-tiddler-title="${title}"]`).first();
}

function text(page, title) {
	return page.evaluate((t) => $tw.wiki.getTiddlerText(t), title);
}

async function outlined(page, title) {
	await page.goto("/");
	await waitForTW(page);
	await navigateToTiddler(page, title);
	await wakeOutline(page, title);
	await expect(frameOf(page, title).locator(".rr-ol.rr-ol-awake")).toHaveCount(1);
}

test.describe("outline range", () => {
	let title;
	const extra = [];

	test.beforeEach(async ({}, testInfo) => {
		title = "OLR " + testInfo.title;
		extra.length = 0;
	});

	test.afterEach(async ({ request }) => {
		for(const t of [title].concat(extra)) {
			await deleteTiddler(request, t);
		}
		await deleteTiddler(request, "$:/temp/rimir/outline/selection/" + title);
	});

	test("shift-down frames a range; alt-down moves it; one undo", async ({ page, request }) => {
		await createTiddler(request, title, { text: "a\n\nb\n\nc\n\nd" });
		await outlined(page, title);
		await frameOf(page, title).locator(".rr-ol p", { hasText: "a" }).click();
		await page.keyboard.press("Shift+ArrowDown");
		await page.keyboard.press("Shift+ArrowDown");
		await expect(frameOf(page, title).locator("p.rr-ol-selected")).toHaveCount(3);
		await page.keyboard.press("Alt+ArrowDown");
		await expect.poll(() => text(page, title)).toBe("d\n\na\n\nb\n\nc");
		await expect(frameOf(page, title).locator("p.rr-ol-selected")).toHaveCount(3);
		await page.keyboard.press("Control+z");
		await expect.poll(() => text(page, title)).toBe("a\n\nb\n\nc\n\nd");
		// Shift-Click picks the range up to a sibling
		await frameOf(page, title).locator(".rr-ol p", { hasText: "b" }).click();
		await frameOf(page, title).locator(".rr-ol p", { hasText: "d" }).click({ modifiers: ["Shift"] });
		await expect(frameOf(page, title).locator("p.rr-ol-selected")).toHaveCount(3);
		// No page text selection left behind (it would take over Ctrl-C / Ctrl-X)
		expect(await page.evaluate(() => window.getSelection().isCollapsed)).toBe(true);
		await page.keyboard.press("Escape");
		await expect(frameOf(page, title).locator("p.rr-ol-selected")).toHaveCount(1);
	});

	test("externalize a paragraph: it renders in place from its new tiddler", async ({ page, request }) => {
		await createTiddler(request, title, { text: "a\n\nb\n\nc" });
		await outlined(page, title);
		await frameOf(page, title).locator(".rr-ol p", { hasText: "b" }).click();
		await page.keyboard.press("Alt+Enter");
		await frameOf(page, title).locator(".rr-ol-menu-item", { hasText: "Externalize" }).click();
		await expect.poll(() => text(page, title)).toMatch(/^a\n\n\{\{.*\/parts\/part\d+\}\}\n\nc$/);
		const part = /\{\{(.*)\}\}/.exec(await text(page, title))[1];
		extra.push(part);
		expect(part.indexOf(title + "/parts/part")).toBe(0);
		expect(await text(page, part)).toBe("b");
		await expect(frameOf(page, title).locator(".rr-ol p")).toHaveText(["a", "b", "c"]);
		// The reference is selected, with the orange frame
		await expect(frameOf(page, title).locator(".rr-ol-selected")).toHaveCSS("outline-color", "rgb(232, 128, 12)");
	});

	test("externalize sub-items: they render nested in their parent, before its remaining sub-item", async ({ page, request }) => {
		const part = title + "/parts/part1";
		extra.push(part);
		await createTiddler(request, title, { text: "* a\n** a1\n** a2\n** a3\n* b" });
		await outlined(page, title);
		await frameOf(page, title).locator(".rr-ol li li", { hasText: "a1" }).click();
		await page.keyboard.press("Shift+ArrowDown");
		await page.keyboard.press("Alt+Enter");
		await frameOf(page, title).locator(".rr-ol-menu-item", { hasText: "Externalize" }).click();
		await expect.poll(() => text(page, title)).toBe("* a <$transclude $tiddler=\"" + part + "\" $mode=\"block\"/>\n** a3\n* b");
		expect(await text(page, part)).toBe("* a1\n* a2");
		await expect(frameOf(page, title).locator(".rr-ol li li")).toHaveText(["a1", "a2", "a3"]);
		// Same structure as before: two top-level bullets; a's nested lists hold a1, a2 (transcluded) and then a3
		await expect(frameOf(page, title).locator(".rr-ol > ul > li")).toHaveCount(2);
		await expect(frameOf(page, title).locator(".rr-ol > ul > li").first().locator(":scope > ul > li")).toHaveText(["a1", "a2", "a3"]);
	});

	test("a bullet that is only a transclusion has the orange frame", async ({ page, request }) => {
		const other = title + " other";
		extra.push(other);
		await createTiddler(request, other, { text: "o" });
		await createTiddler(request, title, { text: "* {{" + other + "}}\n* b" });
		await outlined(page, title);
		await frameOf(page, title).locator(".rr-ol li").first().click();
		await expect(frameOf(page, title).locator("li.rr-ol-selected")).toHaveCSS("outline-color", "rgb(232, 128, 12)");
		// Enter edits the bullet's line, Shift-Enter opens the transcluded tiddler in an overlay
		await page.keyboard.press("Enter");
		await expect(frameOf(page, title).locator(".rr-ol-editor-host textarea")).toHaveValue("{{" + other + "}}");
		await page.keyboard.press("Escape");
		await page.keyboard.press("Shift+Enter");
		extra.push("$:/temp/rimir/outline/selection/" + other);
		await expect(frameOf(page, title).locator(`.rr-ol-overlay .rr-ol.rr-ol-awake[data-ol-tiddler="${other}"]`)).toHaveCount(1);
	});
});
