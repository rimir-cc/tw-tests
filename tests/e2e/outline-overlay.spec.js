const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler, wakeOutline } = require("./helpers");

// Outline transclusion overlay: Shift-Enter on a wikitext transclusion opens the target's own outline over the unit.
// Tiddlers are named "OLO <test title>".

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

test.describe("outline overlay", () => {
	let title, target;
	const extra = [];

	test.beforeEach(async ({ request }, testInfo) => {
		title = "OLO " + testInfo.title;
		target = title + " target";
		extra.length = 0;
		await createTiddler(request, target, { text: "* t1\n* t2" });
		await createTiddler(request, title, { text: "para\n\n{{" + target + "}}\n\nend" });
	});

	test.afterEach(async ({ request }) => {
		for(const t of [title, target].concat(extra)) {
			await deleteTiddler(request, t);
		}
		await deleteTiddler(request, "$:/temp/rimir/outline/selection/" + title);
		await deleteTiddler(request, "$:/temp/rimir/outline/selection/" + target);
	});

	async function openOverlay(page) {
		await outlined(page, title);
		await frameOf(page, title).locator(".rr-ol p", { hasText: "para" }).click();
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Shift+Enter");
		const overlay = frameOf(page, title).locator(".rr-ol-overlay");
		await expect(overlay.locator(`.rr-ol.rr-ol-awake[data-ol-tiddler="${target}"]`)).toHaveCount(1);
		return overlay;
	}

	test("shift-enter opens the target over the unit; edits there go to the target", async ({ page }) => {
		const overlay = await openOverlay(page);
		await expect(overlay.locator(".rr-ol-overlay-title")).toHaveText(target);
		// At the unit's top
		const unitTop = await frameOf(page, title).locator(".rr-ol > ul").first().evaluate((n) => n.getBoundingClientRect().top);
		const overlayTop = await overlay.evaluate((n) => n.getBoundingClientRect().top);
		expect(Math.abs(overlayTop - unitTop)).toBeLessThan(4);
		// Navigate and edit as always
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Enter");
		await page.keyboard.type("X");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, target)).toBe("* t1\n* t2X");
		// The host renders the change underneath, the overlay stays
		await expect(overlay).toHaveCount(1);
		await expect(frameOf(page, title).locator(".rr-ol > ul li").last()).toHaveText("t2X");
		await expect(overlay.locator("li").last()).toHaveText("t2X");
	});

	test("escape clears the overlay's selection, then closes it; the host has the focus and its unit again", async ({ page }) => {
		const overlay = await openOverlay(page);
		await page.keyboard.press("Escape");
		await expect(overlay).toHaveCount(1);
		await page.keyboard.press("Escape");
		await expect(overlay).toHaveCount(0);
		await expect(frameOf(page, title).locator(".rr-ol.rr-ol-awake")).toBeFocused();
		await expect(frameOf(page, title).locator(".rr-ol-selected")).toHaveAttribute("data-ol-kind", "transclusion");
	});

	test("a click outside closes it; a click inside does not", async ({ page }) => {
		const overlay = await openOverlay(page);
		// A click on the title bar keeps the keys in the overlay (not in the host underneath)
		await overlay.locator(".rr-ol-overlay-title").click();
		await expect(overlay.locator(".rr-ol.rr-ol-awake")).toBeFocused();
		await overlay.locator("li", { hasText: "t2" }).click();
		await expect(overlay).toHaveCount(1);
		await expect(overlay.locator("li.rr-ol-selected")).toHaveText("t2");
		// (the overlay covers what is below the unit: the paragraph above it is outside)
		await frameOf(page, title).locator(".rr-ol p", { hasText: "para" }).click();
		await expect(overlay).toHaveCount(0);
	});

	test("on a bullet in the middle of a list the overlay sits at the bullet; its block menu is visible", async ({ page, request }) => {
		await createTiddler(request, title, { text: "para one\n\npara two\n\n* a\n* b\n* {{" + target + "}}\n* c" });
		await outlined(page, title);
		const li = frameOf(page, title).locator(".rr-ol > ul > li").nth(2);
		await li.click({ position: { x: 5, y: 5 } });
		await page.keyboard.press("Shift+Enter");
		const overlay = frameOf(page, title).locator(".rr-ol-overlay");
		await expect(overlay).toHaveCount(1);
		const liTop = await li.evaluate((n) => n.getBoundingClientRect().top);
		const overlayTop = await overlay.evaluate((n) => n.getBoundingClientRect().top);
		expect(Math.abs(overlayTop - liTop)).toBeLessThan(4);
		// The block menu inside the overlay is not cut off: its last entry can be clicked
		await page.keyboard.press("Alt+Enter");
		const menu = overlay.locator(".rr-ol-menu");
		await expect(menu).toBeVisible();
		await menu.locator(".rr-ol-menu-item").last().scrollIntoViewIfNeeded();
		await expect(menu.locator(".rr-ol-menu-item").last()).toBeInViewport();
		expect(await overlay.evaluate((n) => getComputedStyle(n).overflowY)).toBe("visible");
	});

	test("ctrl-c and ctrl-x work in the overlay, on the target's units", async ({ page }) => {
		const overlay = await openOverlay(page);
		await page.evaluate(() => {
			document.addEventListener("copy", (e) => { window.__clip = e.clipboardData.getData("text/plain"); });
		});
		await overlay.locator("li", { hasText: "t2" }).click();
		await page.keyboard.press("Control+c");
		await expect.poll(() => page.evaluate(() => window.__clip)).toBe("* t2");
		await expect(overlay.locator(".rr-ol-copied")).toHaveCount(1);
		await page.keyboard.press("Control+x");
		await expect.poll(() => text(page, target)).toBe("* t1");
	});

	test("opening puts the page's caret into the overlay, closing back into the host (copy goes where the caret is)", async ({ page }) => {
		const overlay = await openOverlay(page);
		expect(await overlay.evaluate((o) => o.contains(window.getSelection().anchorNode))).toBe(true);
		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");
		await expect(overlay).toHaveCount(0);
		expect(await frameOf(page, title).locator(".rr-ol").first().evaluate((h) => h.contains(window.getSelection().anchorNode))).toBe(true);
	});

	test("keyboard only: ctrl-c in the overlay works while the page's caret is still in the host", async ({ page }) => {
		const overlay = await openOverlay(page);
		await page.evaluate(() => {
			document.addEventListener("copy", (e) => { window.__clip = e.clipboardData.getData("text/plain"); });
		});
		// A caret left in the host's text (from an earlier click there)
		await frameOf(page, title).locator(".rr-ol p", { hasText: "para" }).evaluate((p) => {
			const range = document.createRange();
			range.setStart(p.firstChild, 2);
			range.collapse(true);
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
		});
		await page.keyboard.press("ArrowRight");
		await page.keyboard.press("ArrowDown");
		await expect(overlay.locator("li.rr-ol-selected")).toHaveText("t2");
		await page.keyboard.press("Control+c");
		await expect.poll(() => page.evaluate(() => window.__clip)).toBe("* t2");
	});

	test("ctrl-shift-enter and the title bar button open the target in the story", async ({ page }) => {
		const overlay = await openOverlay(page);
		await overlay.locator("[data-ol-overlay-action=story]").click();
		await expect(overlay).toHaveCount(0);
		await expect(frameOf(page, target).locator(".rr-ol.rr-ol-awake")).toHaveCount(1);
	});
});
