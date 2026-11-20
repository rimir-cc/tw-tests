const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler } = require("./helpers");

// Outline mode: rendering parity with the normal body, toggle-off cleanliness, draft exclusion and
// a round trip of the structural operations over every unit of a corpus note.
// Fixture notes come from the plugin's own test/fixtures.js. Tiddlers are named "OLT <test title>".

const STATE_ON = "$:/state/rimir/outline/on/";
const FIXTURES = "$:/plugins/rimir/outline/test/fixtures.js";

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

function text(page, title) {
	return page.evaluate((t) => $tw.wiki.getTiddlerText(t), title);
}

// Body HTML with all outline additions removed: data-ol-*, tabindex, rr-ol-* classes, marker
// elements and the container wrapper itself
function normalizedBody(page, title) {
	return page.evaluate((t) => {
		const frame = document.querySelector(`.tc-tiddler-frame[data-tiddler-title="${t}"]`);
		const body = frame.querySelector(".tc-tiddler-body").cloneNode(true);
		body.querySelectorAll(".rr-ol-tmark").forEach((e) => e.remove());
		body.querySelectorAll(".rr-ol").forEach((e) => e.replaceWith(...e.childNodes));
		const all = [body, ...body.querySelectorAll("*")];
		all.forEach((e) => {
			Array.from(e.attributes).forEach((a) => {
				if(a.name.indexOf("data-ol-") === 0 || a.name === "tabindex") { e.removeAttribute(a.name); }
			});
			Array.from(e.classList).forEach((c) => { if(c.indexOf("rr-ol") === 0) { e.classList.remove(c); } });
			if(e.getAttribute("class") === "") { e.removeAttribute("class"); }
		});
		return body.innerHTML;
	}, title);
}

test.describe("outline parity", () => {
	let title;

	test.beforeEach(async ({}, testInfo) => {
		title = "OLT " + testInfo.title;
	});

	test.afterEach(async ({ request }) => {
		await deleteTiddler(request, title);
		await deleteTiddler(request, STATE_ON + title);
	});

	test("parity", async ({ page, request }) => {
		await open(page, title);
		const notes = await page.evaluate((m) => $tw.modules.execute(m).NOTES, FIXTURES);
		const names = Object.keys(notes);
		expect(names.length).toBeGreaterThanOrEqual(12);
		for(const name of names) {
			await page.evaluate(([t, x]) => {
				$tw.wiki.deleteTiddler("$:/state/rimir/outline/on/" + t);
				$tw.wiki.addTiddler({ title: t, text: x });
			}, [title, notes[name]]);
			await expect(frameOf(page, title)).toBeVisible();
			await page.waitForTimeout(50);
			const off = await normalizedBody(page, title);
			await page.evaluate((t) => $tw.wiki.addTiddler({ title: "$:/state/rimir/outline/on/" + t, text: "yes" }), title);
			await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
			const on = await normalizedBody(page, title);
			expect(on, "note " + name).toBe(off);
		}
	});

	test("toggle off leaves DOM identical", async ({ page, request }) => {
		await createTiddler(request, title, { text: "! h\n\n* a\n** a1\n* b\n\npara\n\n<$text text=x/>" });
		await open(page, title);
		const before = await frameOf(page, title).locator(".tc-tiddler-body").innerHTML();
		await toggle(page, title);
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
		await toggle(page, title);
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(0);
		expect(await frameOf(page, title).locator(".tc-tiddler-body").innerHTML()).toBe(before);
	});

	test("hidden while draft exists", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await page.goto("/");
		await waitForTW(page);
		await page.evaluate((t) => $tw.wiki.addTiddler({ title: "$:/state/rimir/outline/on/" + t, text: "yes" }), title);
		await navigateToTiddler(page, title);
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
		await frameOf(page, title).locator('button[aria-label="Edit this tiddler"]').click();
		const draft = `Draft of '${title}'`;
		await expect(frameOf(page, draft)).toBeVisible();
		await expect(frameOf(page, draft).locator('button[aria-label="outline"]')).toHaveCount(0);
		await expect(page.locator(".rr-ol")).toHaveCount(0);
		// the body filter does not apply to the draft itself
		const out = await page.evaluate((d) => {
			$tw.wiki.addTiddler({ title: "$:/state/rimir/outline/on/" + d, text: "yes" });
			return $tw.wiki.filterTiddlers("[[" + d + "]] :filter[!has[draft.of]]").length;
		}, draft);
		expect(out).toBe(0);
	});

	test("all operations on corpus", async ({ page, request }) => {
		const note = await (async () => {
			await open(page, title);
			return page.evaluate((m) => $tw.modules.execute(m).NOTES.nestedLists, FIXTURES);
		})();
		await createTiddler(request, title, { text: note });
		await open(page, title);
		await toggle(page, title);
		const units = frameOf(page, title).locator("[data-ol-id]");
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
		const count = await units.count();
		expect(count).toBeGreaterThan(5);
		await units.first().click();
		const sel = frameOf(page, title).locator(".rr-ol-selected");
		for(let i = 0; i < count; i++) {
			await expect(sel).toHaveCount(1);
			for(const [fwd, back] of [["Alt+ArrowDown", "Alt+ArrowUp"], ["Tab", "Shift+Tab"]]) {
				const orig = await text(page, title);
				await page.keyboard.press(fwd);
				await page.waitForTimeout(80);
				if(await text(page, title) === orig) { continue; } // edge no-op
				await page.keyboard.press(back);
				await expect.poll(() => text(page, title), { message: `unit ${i} ${fwd}/${back}` }).toBe(orig);
			}
			await page.keyboard.press("ArrowDown");
		}
	});
});
