const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler, wakeOutline } = require("./helpers");

// Outline: rendering parity with the normal body (idle and awake), sleep cleanliness, draft exclusion and
// a round trip of the structural operations over every unit of a corpus note.
// Fixture notes come from the plugin's own test/fixtures.js. Tiddlers are named "OLT <test title>".

const FIXTURES = "$:/plugins/rimir/outline/test/fixtures.js";

function frameOf(page, title) {
	return page.locator(`.tc-tiddler-frame[data-tiddler-title="${title}"]`).first();
}

async function open(page, title) {
	await page.goto("/");
	await waitForTW(page);
	await navigateToTiddler(page, title);
}


function text(page, title) {
	return page.evaluate((t) => $tw.wiki.getTiddlerText(t), title);
}

// Resolves once TW's refresh queue and the following frames have run
function settled(page) {
	return page.evaluate(() => new Promise((r) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(r)), 0)));
}

// Body HTML with all outline additions removed: data-ol-*, tabindex, rr-ol-* classes, marker
// elements, the ? button / key overview and the container wrappers themselves
function normalizedBody(page, title) {
	return page.evaluate((t) => {
		const frame = document.querySelector(`.tc-tiddler-frame[data-tiddler-title="${t}"]`);
		const body = frame.querySelector(".tc-tiddler-body").cloneNode(true);
		body.querySelectorAll(".rr-ol-tmark").forEach((e) => e.remove());
		body.querySelectorAll(".rr-ol-help-bar").forEach((e) => e.remove());
		body.querySelectorAll(".rr-ol-empty").forEach((e) => e.remove());
		body.querySelectorAll(".rr-ol-frame, .rr-ol").forEach((e) => e.replaceWith(...e.childNodes));
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
	});

	test("parity", async ({ page, request }) => {
		await open(page, title);
		const notes = await page.evaluate((m) => $tw.modules.execute(m).NOTES, FIXTURES);
		const names = Object.keys(notes);
		expect(names.length).toBeGreaterThanOrEqual(12);
		for(const name of names) {
			// Without the plugin's body: this tiddler left out (outline: no; the global setting would reach the tests
			// of other workers on the same server)
			await page.evaluate(([t, x]) => $tw.wiki.addTiddler({ title: t, text: x, outline: "no" }), [title, notes[name]]);
			await settled(page);
			await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(0);
			const off = await normalizedBody(page, title);
			// Idle: the wrapper, nothing stamped
			await page.evaluate(([t, x]) => $tw.wiki.addTiddler({ title: t, text: x }), [title, notes[name]]);
			await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
			await expect(frameOf(page, title).locator("[data-ol-id]")).toHaveCount(0);
			expect(await normalizedBody(page, title), "idle note " + name).toBe(off);
			// Awake
			await wakeOutline(page, title);
			expect(await normalizedBody(page, title), "awake note " + name).toBe(off);
			await page.keyboard.press("Escape");
			await expect(frameOf(page, title).locator(".rr-ol-awake")).toHaveCount(0);
		}
	});

	test("sleep leaves the DOM as it was before waking", async ({ page, request }) => {
		await createTiddler(request, title, { text: "! h\n\n* a\n** a1\n* b\n\npara\n\n<$text text=x/>" });
		await open(page, title);
		const before = await frameOf(page, title).locator(".tc-tiddler-body").innerHTML();
		await wakeOutline(page, title);
		await expect(frameOf(page, title).locator("[data-ol-id]").first()).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(frameOf(page, title).locator(".rr-ol-awake")).toHaveCount(0);
		expect(await frameOf(page, title).locator(".tc-tiddler-body").innerHTML()).toBe(before);
	});

	test("an idle body has the width of the normal body", async ({ page, request }) => {
		await createTiddler(request, title, { text: "para" });
		await open(page, title);
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
		const idle = await frameOf(page, title).locator(".rr-ol p").evaluate((p) => p.getBoundingClientRect().width);
		await page.evaluate((t) => $tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler(t), { outline: "no" })), title);
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(0);
		const plain = await frameOf(page, title).locator(".tc-tiddler-body p").evaluate((p) => p.getBoundingClientRect().width);
		expect(idle).toBe(plain);
	});

	test("hidden while draft exists", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await open(page, title);
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
		await frameOf(page, title).locator('button[aria-label="Edit this tiddler"]').click();
		const draft = `Draft of '${title}'`;
		await expect(frameOf(page, draft)).toBeVisible();
		await expect(frameOf(page, draft).locator(".rr-ol")).toHaveCount(0);
		const cascade = (t) => page.evaluate((x) => $tw.wiki.renderText("text/plain", "text/vnd.tiddlywiki",
			"<$text text={{{ [<currentTiddler>] :cascade[all[shadows+tiddlers]tag[$:/tags/ViewTemplateBodyFilter]!is[draft]get[text]] }}}/>",
			{ variables: { currentTiddler: x } }), t);
		expect(await cascade(draft)).toBe("$:/core/ui/ViewTemplate/body/default");
		// positive control: the same cascade selects the outline body for the original
		expect(await cascade(title)).toBe("$:/plugins/rimir/outline/ui/body");
	});

	test("all operations on corpus", async ({ page, request }) => {
		const note = await (async () => {
			await open(page, title);
			return page.evaluate((m) => $tw.modules.execute(m).NOTES.nestedLists, FIXTURES);
		})();
		await createTiddler(request, title, { text: note });
		await open(page, title);
		await wakeOutline(page, title);
		const units = frameOf(page, title).locator("[data-ol-id]");
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
		const count = await units.count();
		expect(count).toBeGreaterThan(5);
		await units.first().click();
		const sel = frameOf(page, title).locator(".rr-ol-selected");
		const original = await text(page, title);
		const effective = { "Alt+ArrowDown": 0, "Tab": 0 };
		for(let i = 0; i < count; i++) {
			await expect(sel).toHaveCount(1);
			for(const [fwd, back] of [["Alt+ArrowDown", "Alt+ArrowUp"], ["Tab", "Shift+Tab"]]) {
				const orig = await text(page, title);
				await page.keyboard.press(fwd);
				// A real change shows up quickly; no change within the window means an edge no-op
				const changed = await expect.poll(() => text(page, title), { timeout: 600 }).not.toBe(orig).then(() => true, () => false);
				if(!changed) { continue; }
				effective[fwd]++;
				// the operation re-renders; wait until the unit is selected and the container focused again
				await settled(page);
				await expect(sel).toHaveCount(1);
				await expect(frameOf(page, title).locator(".rr-ol")).toBeFocused();
				await page.keyboard.press(back);
				await expect.poll(() => text(page, title), { message: `unit ${i} ${fwd}/${back}` }).toBe(orig);
				await settled(page);
				await expect(sel).toHaveCount(1);
				await expect(frameOf(page, title).locator(".rr-ol")).toBeFocused();
			}
			// Ctrl-Down: every unit, also into lists
			await page.keyboard.press("Control+ArrowDown");
		}
		expect(effective["Alt+ArrowDown"]).toBeGreaterThanOrEqual(2);
		expect(effective["Tab"]).toBeGreaterThanOrEqual(2);
		expect(await text(page, title)).toBe(original);
	});
});
