const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler } = require("./helpers");

// Outline mode: toggle, selection, configurable keys and the structural operations
// (move, indent, promote). Fixtures are normal tiddlers named "OLT <test title>", created through
// the server before the page loads and deleted in afterEach.

const STATE_ON = "$:/state/rimir/outline/on/";
const READ_ONLY = "$:/status/IsReadOnly";

function frameOf(page, title) {
	return page.locator(`.tc-tiddler-frame[data-tiddler-title="${title}"]`).first();
}

async function open(page, title) {
	await page.goto("/");
	await waitForTW(page);
	await navigateToTiddler(page, title);
}

async function toggle(page, title) {
	await frameOf(page, title).locator('button[aria-label="outline"]').click();
}

// Open the tiddler and switch outline mode on
async function outlined(page, title) {
	await open(page, title);
	await toggle(page, title);
	await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
}

function text(page, title) {
	return page.evaluate((t) => $tw.wiki.getTiddlerText(t), title);
}

function selected(page, title) {
	return frameOf(page, title).locator(".rr-ol-selected");
}

// Click the list item whose own text is `label`
async function clickItem(page, title, label) {
	await frameOf(page, title).locator("li").filter({ hasText: new RegExp("^" + label + "$") }).first().click();
}

test.describe("outline structure", () => {
	let title;

	test.beforeEach(async ({ request }, testInfo) => {
		title = "OLT " + testInfo.title;
	});

	test.afterEach(async ({ page, request }) => {
		await page.evaluate((t) => $tw.wiki.deleteTiddler(t), READ_ONLY).catch(() => {});
		await deleteTiddler(request, title);
		await deleteTiddler(request, STATE_ON + title);
	});

	test("toggle on and off", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await open(page, title);
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(0);
		await toggle(page, title);
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
		await expect(frameOf(page, title).locator("[data-ol-id]")).toHaveCount(3);
		await toggle(page, title);
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(0);
		await expect(frameOf(page, title).locator("[data-ol-id]")).toHaveCount(0);
		await expect(frameOf(page, title).locator("li")).toHaveCount(2);
	});

	test("click and arrows select", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b\n\npara" });
		await outlined(page, title);
		await clickItem(page, title, "a");
		await expect(selected(page, title)).toHaveCount(1);
		await expect(selected(page, title)).toHaveText("a");
		await expect(page.locator(".rr-ol")).toBeFocused();
		await page.keyboard.press("ArrowUp");
		await expect(selected(page, title)).toHaveAttribute("data-ol-kind", "list");
		await page.keyboard.press("ArrowDown");
		await expect(selected(page, title)).toHaveText("a");
		await page.keyboard.press("ArrowDown");
		await expect(selected(page, title)).toHaveText("b");
		await page.keyboard.press("ArrowDown");
		await expect(selected(page, title)).toHaveText("para");
		await expect(selected(page, title)).toHaveAttribute("data-ol-kind", "block");
		// At the end: stays
		await page.keyboard.press("ArrowDown");
		await expect(selected(page, title)).toHaveText("para");
		await page.keyboard.press("Escape");
		await expect(selected(page, title)).toHaveCount(0);
	});

	test("selection follows moved unit", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await outlined(page, title);
		await clickItem(page, title, "b");
		await page.keyboard.press("Alt+ArrowUp");
		await expect.poll(() => text(page, title)).toBe("* b\n* a");
		await expect(selected(page, title)).toHaveCount(1);
		await expect(selected(page, title)).toHaveText("b");
		await expect(selected(page, title)).toHaveAttribute("data-ol-kind", "item");
		// The moved unit can be moved again from its new place
		await page.keyboard.press("Alt+ArrowDown");
		await expect.poll(() => text(page, title)).toBe("* a\n* b");
		await expect(selected(page, title)).toHaveText("b");
	});

	test("alt-down moves children along", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n** a1\n* b" });
		await outlined(page, title);
		await frameOf(page, title).locator("li").first().click({ position: { x: 30, y: 5 } });
		await expect(selected(page, title)).toContainText("a1");
		await page.keyboard.press("Alt+ArrowDown");
		await expect.poll(() => text(page, title)).toBe("* b\n* a\n** a1");
		await expect(selected(page, title)).toContainText("a1");
		await expect(selected(page, title)).not.toContainText("b");
	});

	test("edge no-op does not write", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await outlined(page, title);
		const before = await page.evaluate((t) => $tw.wiki.getTiddler(t).fields.modified, title);
		await clickItem(page, title, "a");
		await page.keyboard.press("Alt+ArrowUp");
		await page.keyboard.press("Shift+Tab");
		await page.waitForTimeout(200);
		expect(await text(page, title)).toBe("* a\n* b");
		const after = await page.evaluate((t) => $tw.wiki.getTiddler(t).fields.modified, title);
		expect(after).toEqual(before);
		await expect(selected(page, title)).toHaveText("a");
	});

	test("tab indents subtree", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b\n** b1" });
		await outlined(page, title);
		await frameOf(page, title).locator("li").nth(1).click({ position: { x: 30, y: 5 } });
		await expect(selected(page, title)).toContainText("b1");
		await page.keyboard.press("Tab");
		await expect.poll(() => text(page, title)).toBe("* a\n** b\n*** b1");
		await expect(selected(page, title)).toHaveAttribute("data-ol-kind", "item");
		await expect(selected(page, title)).toContainText("b1");
		await expect(selected(page, title)).not.toContainText("a");
	});

	test("shift-tab promotes", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n** b" });
		await outlined(page, title);
		await clickItem(page, title, "b");
		await page.keyboard.press("Shift+Tab");
		await expect.poll(() => text(page, title)).toBe("* a\n* b");
		await expect(selected(page, title)).toHaveText("b");
	});

	test("tab keeps focus", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await outlined(page, title);
		await clickItem(page, title, "a");
		// Indent of the first item is a no-op: Tab must still not move the focus
		await page.keyboard.press("Tab");
		await expect(page.locator(".rr-ol")).toBeFocused();
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Tab");
		await expect.poll(() => text(page, title)).toBe("* a\n** b");
		await expect(page.locator(".rr-ol")).toBeFocused();
		expect(await page.evaluate(() => document.activeElement.classList.contains("rr-ol"))).toBe(true);
	});

	test("heading indent carries section", async ({ page, request }) => {
		await createTiddler(request, title, { text: "! H\n\npara\n\n!! S\n\n! I" });
		await outlined(page, title);
		await frameOf(page, title).locator(".rr-ol h1").first().click();
		await page.keyboard.press("Tab");
		await expect.poll(() => text(page, title)).toBe("!! H\n\npara\n\n!!! S\n\n! I");
		await expect(selected(page, title)).toHaveText("H");
		await expect(frameOf(page, title).locator(".rr-ol h2")).toHaveText("H");
	});

	test("read-only blocks moves", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await outlined(page, title);
		await page.evaluate((t) => $tw.wiki.addTiddler({ title: t, text: "yes" }), READ_ONLY);
		await clickItem(page, title, "b");
		await page.keyboard.press("Alt+ArrowUp");
		await page.keyboard.press("Tab");
		await page.waitForTimeout(200);
		expect(await text(page, title)).toBe("* a\n* b");
		await expect(selected(page, title)).toHaveText("b");
		// Selection still works
		await page.keyboard.press("ArrowUp");
		await expect(selected(page, title)).toHaveText("a");
		await page.keyboard.press("Escape");
		await expect(selected(page, title)).toHaveCount(0);
	});
});
