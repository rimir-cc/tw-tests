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
		await page.keyboard.press("ArrowDown");
		await expect(selected(page, title)).toHaveText("b");
		await page.keyboard.press("ArrowUp");
		await page.keyboard.press("ArrowUp");
		await expect(selected(page, title)).toHaveAttribute("data-ol-kind", "list");
		// Down from the whole list: the block after it
		await page.keyboard.press("ArrowDown");
		await expect(selected(page, title)).toHaveText("para");
		await expect(selected(page, title)).toHaveAttribute("data-ol-kind", "block");
		// Up from below: the whole list again; Ctrl-Up: its last item
		await page.keyboard.press("ArrowUp");
		await expect(selected(page, title)).toHaveAttribute("data-ol-kind", "list");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Control+ArrowUp");
		await expect(selected(page, title)).toHaveText("b");
		await page.keyboard.press("ArrowDown");
		await expect(selected(page, title)).toHaveText("para");
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

	test("two alt-down before the refresh move two steps", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b\n* c" });
		await outlined(page, title);
		await clickItem(page, title, "a");
		await expect(selected(page, title)).toHaveText("a");
		// Both keydowns in one task: the second arrives before TW's refresh of the first write
		await page.evaluate(() => {
			const el = document.querySelector(".rr-ol");
			for(let i = 0; i < 2; i++) {
				const ev = new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", altKey: true, bubbles: true, cancelable: true });
				Object.defineProperty(ev, "keyCode", { get: () => 40 });
				Object.defineProperty(ev, "which", { get: () => 40 });
				el.dispatchEvent(ev);
			}
		});
		await expect.poll(() => text(page, title)).toBe("* b\n* c\n* a");
		await expect(selected(page, title)).toHaveText("a");
		// Real key presses in a row
		await page.keyboard.press("Alt+ArrowUp");
		await page.keyboard.press("Alt+ArrowUp");
		await expect.poll(() => text(page, title)).toBe("* a\n* b\n* c");
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

	test("item with sub-items is framed around its own line only", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n** a1\n** a2\n* b" });
		await outlined(page, title);
		const frame = frameOf(page, title);
		const li = frame.locator("li").first();
		await li.click({ position: { x: 30, y: 5 } });
		await expect(li).toHaveClass(/rr-ol-selected-own/);
		const box = frame.locator(".rr-ol-selbox");
		await expect(box).toBeVisible();
		// The li itself draws no frame; the box covers the own line, not the sub-items
		expect(await li.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
		const boxRect = await box.boundingBox();
		const liRect = await li.boundingBox();
		const subRect = await frame.locator("li li").first().boundingBox();
		expect(boxRect.height).toBeLessThan(liRect.height / 2);
		expect(boxRect.y + boxRect.height).toBeLessThanOrEqual(subRect.y + 1);
		expect(Math.abs(boxRect.y - liRect.y)).toBeLessThan(3);
		// Moving still takes the sub-items, and the box follows the moved item
		await page.keyboard.press("Alt+ArrowDown");
		await expect.poll(() => text(page, title)).toBe("* b\n* a\n** a1\n** a2");
		await expect(async () => {
			const moved = await frame.locator("li").nth(1).boundingBox();
			const b2 = await box.boundingBox();
			expect(Math.abs(b2.y - moved.y)).toBeLessThan(3);
		}).toPass();
		// A leaf item has its own plain frame, the box is hidden
		await page.keyboard.press("ArrowUp");
		await expect(frame.locator("li").first()).toHaveClass(/rr-ol-selected/);
		await expect(frame.locator("li").first()).not.toHaveClass(/rr-ol-selected-own/);
		await expect(box).toBeHidden();
	});

	test("left/right select parent and first child", async ({ page, request }) => {
		await createTiddler(request, title, { text: "! H\n\n* a\n** a1\n* b" });
		await outlined(page, title);
		await clickItem(page, title, "a1");
		await page.keyboard.press("ArrowLeft");
		await expect(frameOf(page, title).locator("li").first()).toHaveClass(/rr-ol-selected/);
		await page.keyboard.press("ArrowLeft");
		await expect(frameOf(page, title).locator("ul").first()).toHaveClass(/rr-ol-selected/);
		await page.keyboard.press("ArrowLeft");
		await expect(frameOf(page, title).locator("h1")).toHaveClass(/rr-ol-selected/);
		await page.keyboard.press("ArrowRight");
		await expect(frameOf(page, title).locator("ul").first()).toHaveClass(/rr-ol-selected/);
		await page.keyboard.press("ArrowRight");
		await expect(frameOf(page, title).locator("li").first()).toHaveClass(/rr-ol-selected/);
		await page.keyboard.press("ArrowRight");
		await expect(frameOf(page, title).locator("li li")).toHaveClass(/rr-ol-selected/);
		expect(await text(page, title)).toBe("! H\n\n* a\n** a1\n* b");
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
