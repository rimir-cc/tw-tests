const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler } = require("./helpers");

// Outline mode: in-place editor (Shift-Enter edit, Ctrl-Enter save, Enter save-and-continue,
// Escape cancel), new units, outside changes while editing, and the transclusion jump.
// Fixtures are tiddlers named "OLT <test title>". The editor uses the core engines; with the editor
// toolbar enabled (default) that is the FramedEngine, so the textarea lives in an iframe.
// window.__olEngineCalls comes from the test-only plugin pw-edition/plugins/outline-engine-probe.

const STATE_ON = "$:/state/rimir/outline/on/";
const BUFFER = "$:/temp/rimir/outline/edit/";
const SELECTION = "$:/temp/rimir/outline/selection/";
const AUTOCOMPLETE = "$:/plugins/EvidentlyCube/AutoComplete";

function frameOf(page, title) {
	return page.locator(`.tc-tiddler-frame[data-tiddler-title="${title}"]`).first();
}

async function open(page, title) {
	await page.goto("/");
	await waitForTW(page);
	await navigateToTiddler(page, title);
}

async function outlined(page, title) {
	await open(page, title);
	await frameOf(page, title).locator('button[aria-label="outline"]').click();
	await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
}

function text(page, title) {
	return page.evaluate((t) => $tw.wiki.getTiddlerText(t), title);
}

function modified(page, title) {
	return page.evaluate((t) => String($tw.wiki.getTiddler(t).fields.modified), title);
}

function hosts(page) {
	return page.locator(".rr-ol-editor-host");
}

// Value of the editor textarea (inside the iframe of the FramedEngine, or directly in the host)
function editorValue(page) {
	return page.evaluate(() => {
		const host = document.querySelector(".rr-ol-editor-host");
		if(!host) { return null; }
		const iframe = host.querySelector("iframe");
		const ta = iframe ? iframe.contentDocument.querySelector("textarea") : host.querySelector("textarea");
		return ta ? ta.value : null;
	});
}

async function clickItem(page, title, label) {
	await frameOf(page, title).locator("li").filter({ hasText: new RegExp("^" + label + "$") }).first().click();
}

// Select the unit with this label and open the editor
async function editItem(page, title, label) {
	await clickItem(page, title, label);
	await page.keyboard.press("Shift+Enter");
	await expect(hosts(page)).toHaveCount(1);
}

test.describe("outline edit", () => {
	let title;
	let extra;

	test.beforeEach(async ({}, testInfo) => {
		title = "OLT " + testInfo.title;
		extra = [];
	});

	test.afterEach(async ({ request }) => {
		for(const t of [title, STATE_ON + title, BUFFER + title, SELECTION + title].concat(extra)) {
			await deleteTiddler(request, t);
		}
	});

	test("shift-enter edits at position", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b\n** b1\n\npara" });
		await outlined(page, title);
		await frameOf(page, title).locator("li").nth(1).click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Shift+Enter");
		await expect(hosts(page)).toHaveCount(1);
		// Items: the host is the first child of the item's li; the li's own text is hidden, its sub-items are not
		const placement = await page.evaluate(() => {
			const host = document.querySelector(".rr-ol-editor-host");
			const li = host.parentNode;
			return {
				tag: host.tagName.toLowerCase(),
				first: li.firstChild === host,
				liStart: li.getAttribute("data-ol-start"),
				own: li.classList.contains("rr-ol-editing-own")
			};
		});
		expect(placement).toEqual({ tag: "div", first: true, liStart: "4", own: true });
		expect(await editorValue(page)).toBe("* b");
		await expect(hosts(page)).toBeVisible();
		await expect(frameOf(page, title).locator("li").filter({ hasText: /^b1$/ })).toBeVisible();
		await page.keyboard.press("Escape");
		// Blocks: the host sits before the hidden unit
		await frameOf(page, title).locator(".rr-ol p").click();
		await page.keyboard.press("Shift+Enter");
		await expect(hosts(page)).toHaveCount(1);
		expect(await page.evaluate(() => {
			const next = document.querySelector(".rr-ol-editor-host").nextElementSibling;
			return next.tagName.toLowerCase() + ":" + next.classList.contains("rr-ol-editing");
		})).toBe("p:true");
		await expect(frameOf(page, title).locator(".rr-ol p[data-ol-start]")).toBeHidden();
		expect(await editorValue(page)).toBe("para");
	});

	test("ctrl-enter writes only that range", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b\n\npara" });
		await outlined(page, title);
		await editItem(page, title, "b");
		await page.keyboard.press("End");
		await page.keyboard.type("X");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* a\n* bX\n\npara");
		await expect(hosts(page)).toHaveCount(0);
		await expect(frameOf(page, title).locator(".rr-ol-selected")).toHaveText("bX");
		await expect(page.locator(".rr-ol")).toBeFocused();
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), BUFFER + title)).toBe(false);
	});

	test("escape discards", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await outlined(page, title);
		await editItem(page, title, "a");
		await page.keyboard.type("zzz");
		await page.keyboard.press("Escape");
		await expect(hosts(page)).toHaveCount(0);
		expect(await text(page, title)).toBe("* a\n* b");
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), BUFFER + title)).toBe(false);
		await expect(frameOf(page, title).locator("li").first()).toBeVisible();
		await expect(page.locator(".rr-ol")).toBeFocused();
	});

	test("typing does not write", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a" });
		await outlined(page, title);
		const before = await modified(page, title);
		await editItem(page, title, "a");
		await page.keyboard.type(" more text");
		await expect.poll(() => page.evaluate((t) => $tw.wiki.getTiddlerText(t), BUFFER + title)).toBe("* a more text");
		await page.waitForTimeout(300);
		expect(await modified(page, title)).toBe(before);
		expect(await text(page, title)).toBe("* a");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* a more text");
	});

	test("enter creates new item after subtree", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n** a1\n* b" });
		await outlined(page, title);
		await frameOf(page, title).locator("li").first().click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Shift+Enter");
		await expect(hosts(page)).toHaveCount(1);
		await page.keyboard.press("Enter");
		// Unchanged item: no write, the new item editor opens right away after a's li (after a1)
		await expect.poll(() => page.evaluate(() => {
			const host = document.querySelector(".rr-ol-editor-host");
			return host && host.previousElementSibling && host.previousElementSibling.getAttribute("data-ol-start");
		})).toBe("0");
		expect(await editorValue(page)).toBe("");
		await page.keyboard.type("n");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* a\n** a1\n* n\n* b");
		await expect(hosts(page)).toHaveCount(0);
		await expect(frameOf(page, title).locator(".rr-ol-selected")).toHaveText("n");
	});

	test("enter on heading creates paragraph under it", async ({ page, request }) => {
		await createTiddler(request, title, { text: "! H\n\n* x" });
		await outlined(page, title);
		await frameOf(page, title).locator(".rr-ol h1").click();
		await page.keyboard.press("Shift+Enter");
		await expect(hosts(page)).toHaveCount(1);
		await page.keyboard.press("End");
		await page.keyboard.type("2");
		await page.keyboard.press("Enter");
		await expect.poll(() => text(page, title)).toBe("! H2\n\n* x");
		await expect.poll(() => page.evaluate(() => {
			const host = document.querySelector(".rr-ol-editor-host");
			return host && host.tagName.toLowerCase() + ":" + host.previousElementSibling.tagName.toLowerCase();
		})).toBe("div:h1");
		await page.keyboard.type("p");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("! H2\n\np\n\n* x");
	});

	test("escape on new unit leaves no trace", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await outlined(page, title);
		const before = await modified(page, title);
		await editItem(page, title, "a");
		await page.keyboard.press("Enter");
		await expect.poll(() => editorValue(page)).toBe("");
		await page.keyboard.type("zz");
		await page.keyboard.press("Escape");
		await expect(hosts(page)).toHaveCount(0);
		expect(await text(page, title)).toBe("* a\n* b");
		expect(await modified(page, title)).toBe(before);
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), BUFFER + title)).toBe(false);
		await expect(frameOf(page, title).locator("li")).toHaveCount(2);
	});

	test("shift-enter inserts newline in item", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a" });
		await outlined(page, title);
		await editItem(page, title, "a");
		await page.keyboard.press("End");
		await page.keyboard.press("Shift+Enter");
		await page.keyboard.type("b");
		expect(await editorValue(page)).toBe("* a\nb");
		await expect(hosts(page)).toHaveCount(1);
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* a\nb");
	});

	test("enter is newline in code block", async ({ page, request }) => {
		await createTiddler(request, title, { text: "```\nx\n```\n\npara" });
		await outlined(page, title);
		await frameOf(page, title).locator(".rr-ol pre").click();
		await page.keyboard.press("Shift+Enter");
		await expect(hosts(page)).toHaveCount(1);
		await page.keyboard.press("Control+Home");
		await page.keyboard.press("End");
		await page.keyboard.press("Enter");
		await page.keyboard.type("y");
		expect(await editorValue(page)).toBe("```\ny\nx\n```");
		await expect(hosts(page)).toHaveCount(1);
		expect(await text(page, title)).toBe("```\nx\n```\n\npara");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("```\ny\nx\n```\n\npara");
	});

	test("editor uses core engine", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a" });
		await outlined(page, title);
		await editItem(page, title, "a");
		await page.evaluate(() => { window.__olEngineCalls = 0; });
		await page.keyboard.type("z");
		expect(await page.evaluate(() => window.__olEngineCalls)).toBeGreaterThan(0);
	});

	test("autocomplete popup wins enter", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a" });
		await createTiddler(request, "OLT autocomplete target", { text: "x" });
		// A "[[" title completion trigger (AutoComplete ships none by default)
		await createTiddler(request, "$:/test/OLT/autocomplete-trigger", {
			tags: "$:/tags/EC/AutoComplete/Trigger",
			trigger: "[[",
			filter: "[all[tiddlers]!is[system]prefix[OLT autocomplete]search:title<query>]",
			"display-filter": "[<currentTiddler>]",
			template: "[[$option$]]$caret$",
			"auto-trigger-textarea": "1"
		});
		extra.push("OLT autocomplete target", "$:/test/OLT/autocomplete-trigger");
		await outlined(page, title);
		const present = await page.evaluate((t) => $tw.wiki.tiddlerExists(t), AUTOCOMPLETE);
		test.skip(!present, "AutoComplete plugin not installed in pw-edition/plugins/");
		await editItem(page, title, "a");
		await page.keyboard.press("End");
		await page.keyboard.type(" [[OLT autocomplete tar");
		await expect(page.locator("ul.ec_ac-completion li.ec_ac-link").first()).toBeVisible();
		await page.keyboard.press("Enter");
		// The popup took Enter: no save, the completion went into the editor
		await expect(hosts(page)).toHaveCount(1);
		expect(await text(page, title)).toBe("* a");
		await expect.poll(() => editorValue(page)).toContain("[[OLT autocomplete target");
	});

	test("editor toolbar present", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a" });
		await outlined(page, title);
		await editItem(page, title, "a");
		const toolbar = hosts(page).locator(".tc-editor-toolbar");
		await expect(toolbar).toHaveCount(1);
		expect(await toolbar.locator("button").count()).toBeGreaterThan(3);
		// Clicking a toolbar button does not close the editor or steal the selection frame
		await toolbar.locator("button").first().click();
		await expect(hosts(page)).toHaveCount(1);
	});

	test("outside change keeps typed text", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* bb" });
		await outlined(page, title);
		await editItem(page, title, "bb");
		await page.keyboard.press("End");
		await page.keyboard.type("X");
		await page.evaluate((t) => $tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler(t), { text: "* new\n* a\n* bb" })), title);
		await expect(frameOf(page, title).locator("li").filter({ hasText: /^new$/ })).toHaveCount(1);
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("* bbX");
		// The editor sits next to the relocated unit and has the focus again
		expect(await page.evaluate(() => document.querySelector(".rr-ol-editor-host").parentNode.getAttribute("data-ol-start"))).toBe("10");
		await page.keyboard.type("Y");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* new\n* a\n* bbXY");
		await expect(hosts(page)).toHaveCount(0);
	});

	test("outside change does not steal the focus", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* bb" });
		await outlined(page, title);
		await editItem(page, title, "bb");
		await page.keyboard.type("X");
		const search = page.locator(".tc-sidebar-search input").first();
		await search.focus();
		await page.evaluate((t) => $tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler(t), { text: "* new\n* a\n* bb" })), title);
		await expect(frameOf(page, title).locator("li").filter({ hasText: /^new$/ })).toHaveCount(1);
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("* bbX");
		await page.waitForTimeout(200);
		await expect(search).toBeFocused();
	});

	test("blank save deletes the item", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b\n* c" });
		await outlined(page, title);
		await editItem(page, title, "b");
		await page.keyboard.press("Control+A");
		await page.keyboard.press("Backspace");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* a\n* c");
		await expect(hosts(page)).toHaveCount(0);
	});

	test("ambiguous outside change shows conflict", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* bb" });
		await outlined(page, title);
		await editItem(page, title, "bb");
		await page.keyboard.press("End");
		await page.keyboard.type("X");
		await page.evaluate((t) => $tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler(t), { text: "* bb\n* bb" })), title);
		await expect(frameOf(page, title).locator("li").filter({ hasText: /^bb$/ })).toHaveCount(2);
		await expect(hosts(page)).toHaveCount(1);
		await page.evaluate(() => {
			const iframe = document.querySelector(".rr-ol-editor-host iframe");
			(iframe ? iframe.contentDocument.querySelector("textarea") : document.querySelector(".rr-ol-editor-host textarea")).focus();
		});
		await page.keyboard.press("Control+Enter");
		await expect(page.locator(".rr-ol-conflict")).toHaveText("The tiddler changed underneath. Copy your text.");
		await expect(hosts(page)).toHaveCount(1);
		expect(await text(page, title)).toBe("* bb\n* bb");
		expect(await page.evaluate((t) => $tw.wiki.getTiddlerText(t), BUFFER + title)).toBe("* bbX");
		expect(await editorValue(page)).toBe("* bbX");
	});

	test("enter on transclusion opens target in outline mode", async ({ page, request }) => {
		const target = title + " target";
		extra.push(target, STATE_ON + target);
		await createTiddler(request, target, { text: "* t1" });
		await createTiddler(request, title, { text: "* a\n\n{{" + target + "}}" });
		await outlined(page, title);
		await clickItem(page, title, "a");
		await page.keyboard.press("ArrowDown");
		await expect(frameOf(page, title).locator(".rr-ol-selected")).toHaveAttribute("data-ol-kind", "transclusion");
		await page.keyboard.press("Enter");
		await expect(frameOf(page, target).locator(".rr-ol")).toHaveCount(1);
		expect(await page.evaluate((t) => $tw.wiki.getTiddlerText(t), STATE_ON + target)).toBe("yes");
		expect(await text(page, title)).toBe("* a\n\n{{" + target + "}}");
	});

	test("marker click opens target", async ({ page, request }) => {
		const target = title + " target";
		extra.push(target, STATE_ON + target);
		await createTiddler(request, target, { text: "* t1" });
		await createTiddler(request, title, { text: "para\n\n{{" + target + "}}" });
		await outlined(page, title);
		const marker = frameOf(page, title).locator(".rr-ol-tmark");
		await expect(marker).toHaveCount(1);
		// The marker of a transcluded list sits inside its first item, not directly in the <ul>
		expect(await marker.evaluate((m) => m.parentNode.tagName.toLowerCase())).toBe("li");
		await marker.click();
		await expect(frameOf(page, target).locator(".rr-ol")).toHaveCount(1);
		expect(await page.evaluate((t) => $tw.wiki.getTiddlerText(t), STATE_ON + target)).toBe("yes");
	});

	test("two views of one tiddler", async ({ page, request }) => {
		const viewer = title + " viewer";
		extra.push(viewer);
		await createTiddler(request, title, { text: "* a\n* b" });
		await createTiddler(request, viewer, {
			text: '<$outline tiddler="' + title + '"><$transclude $tiddler="' + title + '" $mode="block"/></$outline>'
		});
		await outlined(page, title);
		await navigateToTiddler(page, viewer);
		await expect(page.locator(".rr-ol")).toHaveCount(2);
		await clickItem(page, title, "b");
		// The second view shows the selection too
		await expect(frameOf(page, viewer).locator(".rr-ol-selected")).toHaveText("b");
		await page.keyboard.press("Shift+Enter");
		await expect(hosts(page)).toHaveCount(1);
		await expect(frameOf(page, title).locator(".rr-ol-editor-host")).toHaveCount(1);
		await expect(frameOf(page, viewer).locator(".rr-ol-editor-host")).toHaveCount(0);
		await page.keyboard.type("x");
		// Shift-Enter in the other view does not open a second editor or overwrite the buffer:
		// the owning editor gets the focus back
		await frameOf(page, viewer).locator("li").filter({ hasText: /^a$/ }).click();
		await page.keyboard.press("Shift+Enter");
		await expect(hosts(page)).toHaveCount(1);
		await expect(frameOf(page, viewer).locator(".rr-ol-editor-host")).toHaveCount(0);
		expect(await page.evaluate((t) => $tw.wiki.getTiddlerText(t), BUFFER + title)).toBe("* bx");
		await page.keyboard.press("Backspace");
		await page.keyboard.press("End");
		await page.keyboard.type("2");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* a\n* b2");
		await expect(hosts(page)).toHaveCount(0);
		await expect(frameOf(page, viewer).locator("li").nth(1)).toHaveText("b2");
		// Keys in the focused view move one shared selection; the other view did not react twice
		await page.keyboard.press("ArrowUp");
		await expect(frameOf(page, title).locator(".rr-ol-selected")).toHaveText("a");
		await expect(frameOf(page, viewer).locator(".rr-ol-selected")).toHaveText("a");
	});
});
