const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler, wakeOutline } = require("./helpers");

// Outline mode: in-place editor (Enter edit, Ctrl-Enter save, Enter save-and-continue,
// Escape cancel), new units, outside changes while editing, and the transclusion jump.
// Fixtures are tiddlers named "OLT <test title>". The editor uses the core engines: the compact editor
// (default, no toolbar) is the SimpleEngine; the full editor ($:/config/rimir/outline/full-editor yes) with the
// toolbar enabled is the FramedEngine, its textarea lives in an iframe. The editor shows an item's or heading's
// content without the marker.
// window.__olEngineCalls comes from the test-only plugin pw-edition/plugins/outline-engine-probe.

const BUFFER = "$:/temp/rimir/outline/edit/";
const SELECTION = "$:/temp/rimir/outline/selection/";
const HELP = "$:/temp/rimir/outline/help/";
const AUTOCOMPLETE = "$:/plugins/EvidentlyCube/AutoComplete";

function frameOf(page, title) {
	return page.locator(`.tc-tiddler-frame[data-tiddler-title="${title}"]`).first();
}

async function open(page, title) {
	await page.goto("/");
	await waitForTW(page);
	await navigateToTiddler(page, title);
}

// Open the tiddler and wake its outline (nothing selected)
async function outlined(page, title) {
	await open(page, title);
	await wakeOutline(page, title);
	await expect(frameOf(page, title).locator(".rr-ol.rr-ol-awake")).toHaveCount(1);
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
	await page.keyboard.press("Enter");
	await expect(hosts(page)).toHaveCount(1);
}

test.describe("outline edit", () => {
	let title;
	let extra;
	let pageErrors;

	test.beforeEach(async ({ page }, testInfo) => {
		title = "OLT " + testInfo.title;
		extra = [];
		// Any uncaught error in the page fails the test (a thrown key handler can still let the browser's default act)
		pageErrors = [];
		page.on("pageerror", (error) => pageErrors.push(error.message));
	});

	test.afterEach(async ({ request }) => {
		expect(pageErrors).toEqual([]);
		for(const t of [title, BUFFER + title, SELECTION + title, HELP + title].concat(extra)) {
			await deleteTiddler(request, t);
		}
	});

	test("shift-enter edits at position", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b\n** b1\n\npara" });
		await outlined(page, title);
		await frameOf(page, title).locator("li").nth(1).click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Enter");
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
		expect(await editorValue(page)).toBe("b");
		await expect(hosts(page)).toBeVisible();
		await expect(frameOf(page, title).locator("li").filter({ hasText: /^b1$/ })).toBeVisible();
		await page.keyboard.press("Escape");
		// Blocks: the host sits before the hidden unit
		await frameOf(page, title).locator(".rr-ol p").click();
		await page.keyboard.press("Enter");
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
		await expect(page.locator(".rr-ol.rr-ol-awake")).toBeFocused();
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
		await expect(page.locator(".rr-ol.rr-ol-awake")).toBeFocused();
	});

	test("typing does not write", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a" });
		await outlined(page, title);
		const before = await modified(page, title);
		await editItem(page, title, "a");
		await page.keyboard.type(" more text");
		await expect.poll(() => page.evaluate((t) => $tw.wiki.getTiddlerText(t), BUFFER + title)).toBe("a more text");
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
		await page.keyboard.press("Enter");
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
		await page.keyboard.press("Enter");
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

	for(const full of [false, true]) {
		test("shift-enter inserts newline in item" + (full ? " (full editor)" : ""), async ({ page, request }) => {
			if(full) {
				extra.push("$:/config/rimir/outline/full-editor");
				await createTiddler(request, "$:/config/rimir/outline/full-editor", { text: "yes" });
			}
			await createTiddler(request, title, { text: "* ac\n* d\n** d1" });
			await outlined(page, title);
			await editItem(page, title, "ac");
			// At the caret, not at the end
			await page.keyboard.press("End");
			await page.keyboard.press("ArrowLeft");
			await page.keyboard.press("Shift+Enter");
			await page.keyboard.type("b");
			await expect.poll(() => editorValue(page)).toBe("a\nbc");
			await expect.poll(() => page.evaluate((t) => $tw.wiki.getTiddlerText(t), BUFFER + title)).toBe("a\nbc");
			await expect(hosts(page)).toHaveCount(1);
			await page.keyboard.press("Control+Enter");
			// Stored as <br>: the item stays one line, the following items keep their list structure
			await expect.poll(() => text(page, title)).toBe("* a<br>bc\n* d\n** d1");
			await expect(frameOf(page, title).locator("li").first().locator("br")).toHaveCount(1);
			await expect(frameOf(page, title).locator("li li")).toHaveText("d1");
			await expect(frameOf(page, title).locator(".tc-tiddler-body")).not.toContainText("**");
			// Editing again shows the line break, not the tag
			await frameOf(page, title).locator("li").first().click({ position: { x: 30, y: 5 } });
			await page.keyboard.press("Enter");
			await expect.poll(() => editorValue(page)).toBe("a\nbc");
			await page.keyboard.press("Escape");
		});
	}

	test("enter is newline in code block", async ({ page, request }) => {
		await createTiddler(request, title, { text: "```\nx\n```\n\npara" });
		await outlined(page, title);
		await frameOf(page, title).locator(".rr-ol pre").click();
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		await page.keyboard.press("Control+Home");
		await page.keyboard.press("End");
		await page.keyboard.press("Enter");
		await page.keyboard.type("y");
		// The editor shows the code without its fence lines
		expect(await editorValue(page)).toBe("x\ny");
		await expect(hosts(page)).toHaveCount(1);
		expect(await text(page, title)).toBe("```\nx\n```\n\npara");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("```\nx\ny\n```\n\npara");
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

	test("compact editor by default: no toolbar, no marker", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n** a1\n! H" });
		await outlined(page, title);
		await frameOf(page, title).locator("li").first().click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		await expect(hosts(page).locator(".tc-editor-toolbar")).toHaveCount(0);
		await expect(hosts(page).locator("textarea.rr-ol-editor-compact")).toHaveCount(1);
		await expect(hosts(page).locator("iframe")).toHaveCount(0);
		expect(await editorValue(page)).toBe("a");
		// One line high, like an input field
		const box = await hosts(page).locator("textarea").boundingBox();
		const lineHeight = await hosts(page).locator("textarea").evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
		expect(box.height).toBeLessThan(lineHeight * 2);
		// No gap: the item's hidden own text takes no space; the sub-item follows right below the field
		const sub = await frameOf(page, title).locator("li li").first().boundingBox();
		expect(sub.y - (box.y + box.height)).toBeLessThan(8);
		await expect(frameOf(page, title).locator("li li").first()).toBeVisible();
		expect(await frameOf(page, title).locator("li li").first().evaluate((el) => getComputedStyle(el).fontSize))
			.toBe(await frameOf(page, title).locator("h1").evaluate((el) => getComputedStyle(el.closest(".tc-tiddler-body")).fontSize));
		await page.keyboard.press("Escape");
		await expect(hosts(page)).toHaveCount(0);
		// Headings: no "!" either; the level is kept on save
		await frameOf(page, title).locator("h1").click();
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("H");
		await page.keyboard.type("2");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* a\n** a1\n! H2");
	});

	test("ctrl-up/down move the editor between units", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n** a1\n* b\n\npara" });
		await outlined(page, title);
		await frameOf(page, title).locator("li").first().click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		await page.keyboard.press("End");
		await page.keyboard.type("X");
		// Down: saves, the editor opens on the sub-item with the focus
		await page.keyboard.press("Control+ArrowDown");
		await expect.poll(() => text(page, title)).toBe("* aX\n** a1\n* b\n\npara");
		await expect.poll(() => editorValue(page)).toBe("a1");
		await expect(hosts(page)).toHaveCount(1);
		await page.keyboard.press("End");
		await page.keyboard.type("Y");
		// Fast: two steps right after a write
		await page.keyboard.press("Control+ArrowDown");
		await page.keyboard.press("Control+ArrowDown");
		await expect.poll(() => editorValue(page)).toBe("para");
		await expect.poll(() => text(page, title)).toBe("* aX\n** a1Y\n* b\n\npara");
		// Up again, back to the first item
		await page.keyboard.press("Control+ArrowUp");
		await expect.poll(() => editorValue(page)).toBe("b");
		await page.keyboard.press("Control+ArrowUp");
		await page.keyboard.press("Control+ArrowUp");
		await expect.poll(() => editorValue(page)).toBe("aX");
		await expect(hosts(page)).toHaveCount(1);
		await page.keyboard.press("Escape");
		await expect(hosts(page)).toHaveCount(0);
		// Outside the editor ctrl-down does nothing
		await page.keyboard.press("Control+ArrowDown");
		await expect(hosts(page)).toHaveCount(0);
		expect(await text(page, title)).toBe("* aX\n** a1Y\n* b\n\npara");
	});

	test("enter edits; no selection frame stays on the saved unit after save-and-new", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await outlined(page, title);
		await clickItem(page, title, "a");
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("a");
		await page.keyboard.press("End");
		await page.keyboard.type("X");
		await page.keyboard.press("Enter");
		await expect.poll(() => text(page, title)).toBe("* aX\n* b");
		await expect.poll(() => editorValue(page)).toBe("");
		// The saved item is still the selection, but shows no frame while the new editor is open
		const saved = frameOf(page, title).locator("li").first();
		await expect(saved).toHaveClass(/rr-ol-selected/);
		expect(await saved.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
		await page.keyboard.press("Escape");
		await expect(hosts(page)).toHaveCount(0);
		expect(await saved.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
	});

	test("tab/shift-tab and alt-up/down while editing keep editing", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* bc\n** b1" });
		await outlined(page, title);
		await frameOf(page, title).locator("li").nth(1).click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		// Caret between b and c
		await page.keyboard.press("End");
		await page.keyboard.press("ArrowLeft");
		await page.keyboard.press("Tab");
		await expect.poll(() => text(page, title)).toBe("* a\n** bc\n*** b1");
		await expect(hosts(page)).toHaveCount(1);
		await expect.poll(() => editorValue(page)).toBe("bc");
		// Focus and caret stay: typing lands between b and c
		await page.keyboard.type("X");
		await expect.poll(() => editorValue(page)).toBe("bXc");
		await page.keyboard.press("Shift+Tab");
		await expect.poll(() => text(page, title)).toBe("* a\n* bXc\n** b1");
		await page.keyboard.type("Y");
		await expect.poll(() => editorValue(page)).toBe("bXYc");
		// Alt-Up/Down move the edited unit with its subtree and keep editing
		await page.keyboard.press("Alt+ArrowUp");
		await expect.poll(() => text(page, title)).toBe("* bXYc\n** b1\n* a");
		await expect(hosts(page)).toHaveCount(1);
		await page.keyboard.type("Z");
		await expect.poll(() => editorValue(page)).toBe("bXYZc");
		await page.keyboard.press("Alt+ArrowDown");
		await expect.poll(() => text(page, title)).toBe("* a\n* bXYZc\n** b1");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* a\n* bXYZc\n** b1");
		await expect(hosts(page)).toHaveCount(0);
	});

	test("block menu: insert after and turn into", async ({ page, request }) => {
		await createTiddler(request, title, { text: "para\n\n* a\n* b\n** b1" });
		await outlined(page, title);
		const menu = frameOf(page, title).locator(".rr-ol-menu");
		const active = menu.locator(".rr-ol-menu-active");
		await frameOf(page, title).locator(".rr-ol p").click();
		await page.keyboard.press("Alt+Enter");
		await expect(menu).toBeVisible();
		await expect(menu.locator(".rr-ol-menu-group")).toHaveText(["Insert after", "Insert before", "Turn into"]);
		await expect(active).toHaveText("Paragraph");
		// Below the selected paragraph
		const pBox = await frameOf(page, title).locator(".rr-ol p").boundingBox();
		const mBox = await menu.boundingBox();
		expect(mBox.y).toBeGreaterThanOrEqual(pBox.y + pBox.height - 1);
		// Escape closes, no editor
		await page.keyboard.press("Escape");
		await expect(menu).toHaveCount(0);
		await expect(hosts(page)).toHaveCount(0);
		// Insert a heading 2 with the keyboard: the field names the type
		await page.keyboard.press("Alt+Enter");
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("ArrowDown");
		await expect(active).toHaveText("Heading 2");
		await page.keyboard.press("Enter");
		await expect(menu).toHaveCount(0);
		await expect(hosts(page)).toHaveCount(1);
		await expect(hosts(page).locator("textarea")).toHaveAttribute("placeholder", "Heading 2");
		await page.keyboard.type("Sub");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("para\n\n!! Sub\n\n* a\n* b\n** b1");
		await expect(frameOf(page, title).locator(".rr-ol h2")).toHaveText("Sub");
		// Turn the heading into a paragraph with the mouse
		await frameOf(page, title).locator(".rr-ol h2").click();
		await page.keyboard.press("Alt+Enter");
		await menu.locator(".rr-ol-menu-item", { hasText: "Paragraph" }).last().click();
		await expect.poll(() => text(page, title)).toBe("para\n\nSub\n\n* a\n* b\n** b1");
		// A bullet: only the list type; numbered switches the siblings, the sub-item keeps its own type
		await clickItem(page, title, "a");
		await page.keyboard.press("Alt+Enter");
		await expect(menu.locator(".rr-ol-menu-item")).toHaveText(["Numbered list"]);
		await page.keyboard.press("Enter");
		await expect.poll(() => text(page, title)).toBe("para\n\nSub\n\n# a\n# b\n#* b1");
		await expect(frameOf(page, title).locator(".rr-ol ol > li")).toHaveCount(2);
		await expect(frameOf(page, title).locator(".rr-ol ol ul > li")).toHaveText("b1");
		// Clicking elsewhere closes the menu
		await page.keyboard.press("Alt+Enter");
		await expect(menu).toBeVisible();
		await frameOf(page, title).locator(".rr-ol p").first().click();
		await expect(menu).toHaveCount(0);
	});

	test("block menu on a transclusion: edit the line", async ({ page, request }) => {
		const target = title + " target";
		extra.push(target);
		await createTiddler(request, target, { text: "t" });
		await createTiddler(request, title, { text: "p\n\n{{" + target + "}}" });
		await outlined(page, title);
		await frameOf(page, title).locator(".rr-ol p").first().click();
		await page.keyboard.press("ArrowDown");
		await expect(frameOf(page, title).locator(".rr-ol-selected")).toHaveAttribute("data-ol-kind", "transclusion");
		await page.keyboard.press("Alt+Enter");
		await expect(frameOf(page, title).locator(".rr-ol-menu-active")).toHaveText("Edit this line");
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("{{" + target + "}}");
	});

	test("editor toolbar present", async ({ page, request }) => {
		extra.push("$:/config/rimir/outline/full-editor");
		await createTiddler(request, "$:/config/rimir/outline/full-editor", { text: "yes" });
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
		expect(await editorValue(page)).toBe("bbX");
		// The editor sits next to the relocated unit and has the focus again
		expect(await page.evaluate(() => document.querySelector(".rr-ol-editor-host").parentNode.getAttribute("data-ol-start"))).toBe("10");
		await page.keyboard.type("Y");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* new\n* a\n* bbXY");
		await expect(hosts(page)).toHaveCount(0);
	});

	test("page re-render keeps typed text", async ({ page, request }) => {
		const global = "OLT global " + title;
		extra.push(global);
		await createTiddler(request, title, { text: "* a\n* b" });
		await outlined(page, title);
		await editItem(page, title, "b");
		await page.keyboard.press("End");
		await page.keyboard.type("X");
		await page.evaluate(() => document.querySelector(".rr-ol").setAttribute("data-olt-old", "yes"));
		// A new global definition re-renders the whole page template: the $outline widget is destroyed and rebuilt
		await page.evaluate((t) => $tw.wiki.addTiddler({ title: t, tags: "$:/tags/Global", text: "\\procedure olt-noop() x" }), global);
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
		await expect(page.locator(".rr-ol[data-olt-old]")).toHaveCount(0);
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("bX");
		expect(await page.evaluate(() => document.querySelector(".rr-ol-editor-host").parentNode.getAttribute("data-ol-start"))).toBe("4");
		// It had the focus: typing goes on where it was
		await page.keyboard.type("Y");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* a\n* bXY");
		await expect(hosts(page)).toHaveCount(0);
	});

	test("closing the tiddler forgets the edit and the selection: it reopens idle", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await outlined(page, title);
		await editItem(page, title, "b");
		await page.keyboard.press("End");
		await page.keyboard.type("X");
		await frameOf(page, title).locator('button[aria-label="close"]').click();
		await expect(frameOf(page, title)).toHaveCount(0);
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), BUFFER + title)).toBe(false);
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), SELECTION + title)).toBe(false);
		await navigateToTiddler(page, title);
		await expect(frameOf(page, title).locator(".rr-ol")).toHaveCount(1);
		await expect(frameOf(page, title).locator(".rr-ol-awake")).toHaveCount(0);
		await expect(frameOf(page, title).locator("[data-ol-id]")).toHaveCount(0);
		await expect(hosts(page)).toHaveCount(0);
		expect(await text(page, title)).toBe("* a\n* b");
	});

	test("idle until Ctrl-Click: plain clicks, double-clicks and keys stay plain TiddlyWiki", async ({ page, request }) => {
		await createTiddler(request, title, { text: "para one\n\n* a\n* b" });
		await open(page, title);
		const frame = frameOf(page, title);
		await expect(frame.locator(".rr-ol")).toHaveCount(1);
		await expect(frame.locator(".rr-ol-help-button")).toBeHidden();
		await frame.locator("li", { hasText: "a" }).click();
		await frame.locator(".rr-ol p").first().dblclick();
		// The double-click selected a word, as without the plugin
		expect(await page.evaluate(() => String(window.getSelection()))).not.toBe("");
		await page.keyboard.press("Enter");
		await expect(frame.locator("[data-ol-id]")).toHaveCount(0);
		await expect(frame.locator(".rr-ol-selected")).toHaveCount(0);
		await expect(hosts(page)).toHaveCount(0);
		expect(await frame.locator(".rr-ol").getAttribute("tabindex")).toBe(null);
		// Ctrl-Click wakes and selects the clicked unit
		await frame.locator("li", { hasText: "b" }).click({ modifiers: ["Control"] });
		await expect(frame.locator(".rr-ol.rr-ol-awake")).toHaveCount(1);
		await expect(frame.locator(".rr-ol-selected")).toHaveText("b");
		await expect(frame.locator(".rr-ol-help-button")).toBeVisible();
		// Keys work now
		await page.keyboard.press("ArrowUp");
		await expect(frame.locator(".rr-ol-selected")).toHaveText("a");
		// Escape clears the selection, a second Escape puts it to sleep
		await page.keyboard.press("Escape");
		await expect(frame.locator(".rr-ol-selected")).toHaveCount(0);
		await expect(frame.locator(".rr-ol-awake")).toHaveCount(1);
		await page.keyboard.press("Escape");
		await expect(frame.locator(".rr-ol-awake")).toHaveCount(0);
		await expect(frame.locator("[data-ol-id]")).toHaveCount(0);
	});

	test("a click outside the tiddler puts it to sleep, not while editing", async ({ page, request }) => {
		const other = title + " other";
		extra.push(other);
		await createTiddler(request, other, { text: "other text" });
		await createTiddler(request, title, { text: "* a\n* b" });
		await outlined(page, title);
		await navigateToTiddler(page, other);
		await clickItem(page, title, "a");
		await editItem(page, title, "b");
		await frameOf(page, other).locator("p").first().click();
		await expect(frameOf(page, title).locator(".rr-ol-awake")).toHaveCount(1);
		await expect(hosts(page)).toHaveCount(1);
		await frameOf(page, title).locator(".rr-ol-editor-host textarea").focus();
		await page.keyboard.press("Escape");
		await expect(hosts(page)).toHaveCount(0);
		await frameOf(page, other).locator("p").first().click();
		await expect(frameOf(page, title).locator(".rr-ol-awake")).toHaveCount(0);
		await expect(frameOf(page, title).locator("[data-ol-id]")).toHaveCount(0);
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), SELECTION + title)).toBe(false);
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
		expect(await editorValue(page)).toBe("bbX");
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
		expect(await page.evaluate((t) => $tw.wiki.getTiddlerText(t), BUFFER + title)).toBe("bbX");
		expect(await editorValue(page)).toBe("bbX");
	});

	test("enter on transclusion opens target in outline mode", async ({ page, request }) => {
		const target = title + " target";
		extra.push(target, SELECTION + target);
		await createTiddler(request, target, { text: "* t1" });
		await createTiddler(request, title, { text: "* a\n\n{{" + target + "}}" });
		await outlined(page, title);
		await clickItem(page, title, "a");
		await page.keyboard.press("ArrowDown");
		await expect(frameOf(page, title).locator(".rr-ol-selected")).toHaveAttribute("data-ol-kind", "transclusion");
		await page.keyboard.press("Enter");
		// The target opens awake, its first unit selected
		await expect(frameOf(page, target).locator(".rr-ol.rr-ol-awake")).toHaveCount(1);
		await expect(frameOf(page, target).locator(".rr-ol-selected")).toHaveText("t1");
		expect(await text(page, title)).toBe("* a\n\n{{" + target + "}}");
	});

	test("marker click opens target", async ({ page, request }) => {
		const target = title + " target";
		extra.push(target, SELECTION + target);
		await createTiddler(request, target, { text: "* t1" });
		await createTiddler(request, title, { text: "para\n\n{{" + target + "}}" });
		await outlined(page, title);
		const marker = frameOf(page, title).locator(".rr-ol-tmark");
		await expect(marker).toHaveCount(1);
		// The marker of a transcluded list sits inside its first item, not directly in the <ul>
		expect(await marker.evaluate((m) => m.parentNode.tagName.toLowerCase())).toBe("li");
		await marker.click();
		await expect(frameOf(page, target).locator(".rr-ol.rr-ol-awake")).toHaveCount(1);
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
		// The viewer's own body wrapper and its explicit outline of the tiddler
		await expect(frameOf(page, viewer).locator(".rr-ol")).toHaveCount(2);
		await clickItem(page, title, "b");
		// The second view shows the selection too
		await expect(frameOf(page, viewer).locator(".rr-ol-selected")).toHaveText("b");
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		await expect(frameOf(page, title).locator(".rr-ol-editor-host")).toHaveCount(1);
		await expect(frameOf(page, viewer).locator(".rr-ol-editor-host")).toHaveCount(0);
		await page.keyboard.type("x");
		// Shift-Enter in the other view does not open a second editor or overwrite the buffer:
		// the owning editor gets the focus back
		await frameOf(page, viewer).locator("li").filter({ hasText: /^a$/ }).click();
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		await expect(frameOf(page, viewer).locator(".rr-ol-editor-host")).toHaveCount(0);
		expect(await page.evaluate((t) => $tw.wiki.getTiddlerText(t), BUFFER + title)).toBe("bx");
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

	test("? shows the key overview next to the outline, Escape and the buttons close it", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b" });
		await outlined(page, title);
		const frame = frameOf(page, title), help = frame.locator(".rr-ol-help");
		await clickItem(page, title, "a");
		await page.keyboard.press("?");
		await expect(help).toBeVisible();
		await expect(help).toContainText("Navigate");
		await expect(help).toContainText("In the block menu");
		await expect(help.locator("kbd", { hasText: /^alt-Up$/ })).toHaveCount(1);
		// Outside the outline: no new units, the keys keep working, the focus stays
		await expect(frame.locator(".rr-ol .rr-ol-help")).toHaveCount(0);
		await page.keyboard.press("ArrowDown");
		await expect(frame.locator(".rr-ol-selected")).toHaveText("b");
		expect(await page.evaluate(() => document.activeElement.classList.contains("rr-ol"))).toBe(true);
		// Escape closes the overview first, then clears the selection
		await page.keyboard.press("Escape");
		await expect(help).toHaveCount(0);
		await expect(frame.locator(".rr-ol-selected")).toHaveText("b");
		// A changed key shows in the open overview at once
		await page.keyboard.press("?");
		extra.push("$:/config/shortcuts/outline-move-up");
		await page.evaluate(() => $tw.wiki.addTiddler({ title: "$:/config/shortcuts/outline-move-up", text: "ctrl-shift-K" }));
		await expect(help.locator("kbd", { hasText: /^ctrl-shift-K$/ })).toHaveCount(1);
		await page.evaluate(() => $tw.wiki.deleteTiddler("$:/config/shortcuts/outline-move-up"));
		await expect(help.locator("kbd", { hasText: /^alt-Up$/ })).toHaveCount(1);
		// The ? button toggles, the close button closes
		await frame.locator(".rr-ol-help-button").click();
		await expect(help).toHaveCount(0);
		await frame.locator(".rr-ol-help-button").click();
		await expect(help).toBeVisible();
		await help.locator(".rr-ol-help-close").click();
		await expect(help).toHaveCount(0);
		// Going to sleep (a click outside the tiddler) closes it for good
		await frame.locator(".rr-ol").focus();
		await page.keyboard.press("?");
		await expect(help).toBeVisible();
		await page.mouse.click(2, 2);
		await expect(frame.locator(".rr-ol-awake")).toHaveCount(0);
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), HELP + title)).toBe(false);
		await expect(help).toHaveCount(0);
	});

	test("double-click edits, Delete asks in the menu", async ({ page, request }) => {
		await createTiddler(request, title, { text: "! A\n\npara\n\n* a\n* b\n\n! B\n\nend" });
		await outlined(page, title);
		const frame = frameOf(page, title), menu = frame.locator(".rr-ol-menu");
		await frame.locator(".rr-ol p").first().dblclick();
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("para");
		expect(await page.evaluate(() => String(window.getSelection()))).toBe("");
		// Caret at the end, nothing selected: typing appends
		await page.keyboard.type("X");
		expect(await editorValue(page)).toBe("paraX");
		await page.keyboard.press("Escape");
		// Enter too
		await frame.locator(".rr-ol p").first().click();
		await page.keyboard.press("Enter");
		await page.keyboard.type("Y");
		expect(await editorValue(page)).toBe("paraY");
		await page.keyboard.press("Escape");
		// Delete on a heading with a section: yes (with count), just the heading, cancel
		await frame.locator(".rr-ol h1").first().click();
		await page.keyboard.press("Delete");
		await expect(menu.locator(".rr-ol-menu-item")).toHaveText([
			"Yes, the heading and its section (4 blocks)", "Just the heading", "Cancel (Esc)"]);
		await page.keyboard.press("Escape");
		await expect(menu).toHaveCount(0);
		await page.keyboard.press("Delete");
		await menu.locator(".rr-ol-menu-item", { hasText: "Just the heading" }).click();
		await expect.poll(() => text(page, title)).toBe("para\n\n* a\n* b\n\n! B\n\nend");
		// A childless item goes at once (quick delete, on by default)
		await clickItem(page, title, "b");
		await page.keyboard.press("Delete");
		await expect(menu).toHaveCount(0);
		await expect.poll(() => text(page, title)).toBe("para\n\n* a\n\n! B\n\nend");
		await expect(frame.locator(".rr-ol-selected")).toHaveCount(1);
		// A paragraph asks; Enter confirms
		await frame.locator(".rr-ol p").first().click();
		await page.keyboard.press("Delete");
		await expect(menu.locator(".rr-ol-menu-item").first()).toHaveText("Yes, delete");
		await page.keyboard.press("Enter");
		await expect.poll(() => text(page, title)).toBe("* a\n\n! B\n\nend");
	});

	test("backspace at the start of a list item merges it into the item above", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* one\n* two\n** two-a\n* three\n\npara" });
		await outlined(page, title);
		await editItem(page, title, "three");
		// Not at the start: a normal backspace
		await page.keyboard.press("End");
		await page.keyboard.press("Backspace");
		expect(await editorValue(page)).toBe("thre");
		await page.keyboard.press("Home");
		await page.keyboard.press("Backspace");
		// Merged into the item visually above (the sub-item), edited at the join
		await expect.poll(() => text(page, title)).toBe("* one\n* two\n** two-athre\n\npara");
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("two-athre");
		await page.keyboard.type("|");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* one\n* two\n** two-a|thre\n\npara");
		// An emptied item is deleted, its sub-items stay; the editor goes to the end of the item above
		await frameOf(page, title).locator("li").nth(1).click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Enter");
		await page.keyboard.press("Control+a");
		await page.keyboard.press("Delete");
		await page.keyboard.press("Backspace");
		await expect.poll(() => text(page, title)).toBe("* one\n** two-a|thre\n\npara");
		expect(await editorValue(page)).toBe("one");
		await page.keyboard.type("!");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* one!\n** two-a|thre\n\npara");
		// The first item of a list and a paragraph: nothing happens
		await frameOf(page, title).locator("li").nth(0).click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Enter");
		await page.keyboard.press("Home");
		await page.keyboard.press("Backspace");
		expect(await editorValue(page)).toBe("one!");
		await page.keyboard.press("Escape");
		// An empty new item: Backspace discards it and edits the item above at its end
		await frameOf(page, title).locator("li").nth(0).click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Enter");
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("");
		await page.keyboard.press("Backspace");
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("two-a|thre");
		expect(await text(page, title)).toBe("* one!\n** two-a|thre\n\npara");
	});

	test("enter in the middle of a list item splits it, backspace joins it again", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* hello world\n* next\n\n# one two\n#* sub" });
		await outlined(page, title);
		await editItem(page, title, "hello world");
		await page.keyboard.press("Home");
		for(let i = 0; i < 6; i++) { await page.keyboard.press("ArrowRight"); }
		await page.keyboard.press("Enter");
		await expect.poll(() => text(page, title)).toBe("* hello\n* world\n* next\n\n# one two\n#* sub");
		// The new item is edited, caret at its start
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("world");
		await page.keyboard.type(">");
		expect(await editorValue(page)).toBe(">world");
		await page.keyboard.press("Backspace");
		// Backspace at its start joins it again
		await page.keyboard.press("Backspace");
		await expect.poll(() => text(page, title)).toBe("* helloworld\n* next\n\n# one two\n#* sub");
		expect(await editorValue(page)).toBe("helloworld");
		await page.keyboard.press("Escape");
		// With sub-items: the rest becomes the first sub-item
		await frameOf(page, title).locator("ol > li").first().click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Enter");
		await page.keyboard.press("Home");
		for(let i = 0; i < 4; i++) { await page.keyboard.press("ArrowRight"); }
		await page.keyboard.press("Enter");
		await expect.poll(() => text(page, title)).toBe("* helloworld\n* next\n\n# one\n#* two\n#* sub");
		await page.keyboard.press("Escape");
		// At the end Enter still saves and opens a new item
		await editItem(page, title, "next");
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("");
		await page.keyboard.press("Escape");
		expect(await text(page, title)).toBe("* helloworld\n* next\n\n# one\n#* two\n#* sub");
	});
	test("ctrl-z undoes a delete and a split (one step each), ctrl-y redoes", async ({ page, request }) => {
		const start = "! A\n\npara\n\n* hello world\n* next\n\n! B\n\nend";
		await createTiddler(request, title, { text: start });
		await outlined(page, title);
		const frame = frameOf(page, title);
		// Delete a heading with its section, then undo
		await frame.locator(".rr-ol h1").first().click();
		await page.keyboard.press("Delete");
		await page.keyboard.press("Enter");
		await expect.poll(() => text(page, title)).toBe("! B\n\nend");
		await page.keyboard.press("Control+z");
		await expect.poll(() => text(page, title)).toBe(start);
		await expect(frame.locator(".rr-ol-selected")).toHaveCount(1);
		await page.keyboard.press("Control+y");
		await expect.poll(() => text(page, title)).toBe("! B\n\nend");
		await page.keyboard.press("Control+z");
		await expect.poll(() => text(page, title)).toBe(start);
		// A split saves the item and adds the new one: one undo step
		await editItem(page, title, "hello world");
		await page.keyboard.press("Home");
		for(let i = 0; i < 6; i++) { await page.keyboard.press("ArrowRight"); }
		await page.keyboard.press("Enter");
		await expect.poll(() => text(page, title)).toBe("! A\n\npara\n\n* hello\n* world\n* next\n\n! B\n\nend");
		await page.keyboard.press("Escape");
		await page.keyboard.press("Control+z");
		await expect.poll(() => text(page, title)).toBe(start);
	});
	test("empty tiddler, insert before, heading moves across blocks, heading to bullet", async ({ page, request }) => {
		await createTiddler(request, title, { text: "" });
		await outlined(page, title);
		const frame = frameOf(page, title), menu = frame.locator(".rr-ol-menu");
		// Empty: a hint; clicking it and Enter writes a first paragraph
		await expect(frame.locator(".rr-ol-empty")).toHaveCount(1);
		await frame.locator(".rr-ol-empty").click();
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		await expect(frame.locator(".rr-ol-empty")).toBeHidden();
		await page.keyboard.type("para");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("para");
		await expect(frame.locator(".rr-ol-empty")).toHaveCount(0);
		// A list below, then a heading before the list through the menu
		await page.evaluate((t) => $tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler(t), { text: "para\n\n* a\n* b" })), title);
		await expect(frame.locator(".rr-ol ul")).toHaveCount(1);
		await frame.locator(".rr-ol p").first().click();
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Alt+Enter");
		await menu.locator(".rr-ol-menu-group", { hasText: /insert before/i }).waitFor();
		const items = menu.locator(".rr-ol-menu-item");
		const labels = await items.allTextContents();
		await items.nth(labels.indexOf("Heading 1", labels.indexOf("Heading 1") + 1)).click();
		await expect(hosts(page)).toHaveCount(1);
		await page.keyboard.type("Top");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("para\n\n! Top\n\n* a\n* b");
		// Alt-Up moves the heading over the paragraph: it joins the section
		await frame.locator(".rr-ol h1").first().click();
		await page.keyboard.press("Alt+ArrowUp");
		await expect.poll(() => text(page, title)).toBe("! Top\n\npara\n\n* a\n* b");
		// The heading turns into a bullet
		await page.keyboard.press("Alt+Enter");
		// The last group is "Turn into"
		await menu.locator(".rr-ol-menu-item", { hasText: "Bulleted list" }).last().click();
		await expect.poll(() => text(page, title)).toBe("* Top\n\npara\n\n* a\n* b");
	});

	test("an empty new item shows its marker and takes tab/shift-tab as its level", async ({ page, request }) => {
		await createTiddler(request, title, { text: "para\n\n# a\n# b" });
		await outlined(page, title);
		const frame = frameOf(page, title), host = hosts(page);
		const look = () => page.evaluate(() => {
			const h = document.querySelector(".rr-ol-editor-host"), cs = getComputedStyle(h);
			return {display: cs.display, list: cs.listStyleType, margin: parseFloat(cs.marginLeft), type: h.getAttribute("data-ol-type")};
		});
		// Block menu after the paragraph: a new bulleted item shows its bullet
		await frame.locator(".rr-ol p").click();
		await page.keyboard.press("Alt+Enter");
		await frame.locator(".rr-ol-menu .rr-ol-menu-item", { hasText: "Bulleted list" }).first().click();
		await expect(host).toHaveCount(1);
		expect(await look()).toMatchObject({display: "list-item", list: "disc", type: "bullet"});
		await page.keyboard.press("Escape");
		await expect(host).toHaveCount(0);
		// Enter after b: Tab goes one level deeper (## under b), a second Tab and a Shift-Tab above level 1 do nothing
		await clickItem(page, title, "b");
		await page.keyboard.press("Enter");
		await page.keyboard.press("Enter");
		await expect(host).toHaveCount(1);
		expect((await look()).margin).toBeLessThan(10);
		await page.keyboard.press("Tab");
		await expect.poll(async () => (await look()).margin).toBeGreaterThan(10);
		await page.keyboard.press("Tab");
		await page.keyboard.press("Shift+Tab");
		await page.keyboard.press("Shift+Tab");
		await expect.poll(async () => (await look()).margin).toBeLessThan(10);
		await page.keyboard.press("Tab");
		await expect.poll(async () => (await look()).type).toBe("numbered");
		expect(await text(page, title)).toBe("para\n\n# a\n# b");
		await page.keyboard.type("c");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("para\n\n# a\n# b\n## c");
		await expect(host).toHaveCount(0);
	});

	test("editing a whole quote or a code block hides the > and the fence lines, saving keeps them", async ({ page, request }) => {
		await createTiddler(request, title, { text: "para\n\n> q1\n> q2\n\n```js\nvar a;\n```" });
		await outlined(page, title);
		const frame = frameOf(page, title);
		// Down from the paragraph selects the whole quote
		await frame.locator(".rr-ol p").click();
		await page.keyboard.press("ArrowDown");
		await expect(frame.locator("blockquote.rr-ol-selected")).toHaveCount(1);
		await page.keyboard.press("Enter");
		await expect.poll(() => editorValue(page)).toBe("q1\nq2");
		await page.keyboard.press("End");
		await page.keyboard.press("Shift+Enter");
		await page.keyboard.type("q3");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("para\n\n> q1\n> q2\n> q3\n\n```js\nvar a;\n```");
		await frame.locator(".rr-ol pre").click();
		await page.keyboard.press("Enter");
		await expect.poll(() => editorValue(page)).toBe("var a;");
		await page.keyboard.press("End");
		await page.keyboard.type(" // x");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("para\n\n> q1\n> q2\n> q3\n\n```js\nvar a; // x\n```");
	});

	test("ctrl-enter in selection mode adds an empty unit below: same item kind, else a paragraph", async ({ page, request }) => {
		await createTiddler(request, title, { text: "! H\n\n* a\n* b\n\n> q\n\n```\nc\n```\n\nend" });
		await outlined(page, title);
		const frame = frameOf(page, title);
		// A bullet: a bullet on its level
		await clickItem(page, title, "b");
		await page.keyboard.press("Control+Enter");
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("");
		await page.keyboard.type("x");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("! H\n\n* a\n* b\n* x\n\n> q\n\n```\nc\n```\n\nend");
		// A heading: a paragraph right under it
		await frame.locator(".rr-ol h1").click();
		await page.keyboard.press("Control+Enter");
		await page.keyboard.type("p");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("! H\n\np\n\n* a\n* b\n* x\n\n> q\n\n```\nc\n```\n\nend");
		// A quote line: a quote line
		await frame.locator(".rr-ol blockquote div").first().click();
		await page.keyboard.press("Control+Enter");
		await page.keyboard.type("r");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("! H\n\np\n\n* a\n* b\n* x\n\n> q\n> r\n\n```\nc\n```\n\nend");
		// A code block: a paragraph after it
		await frame.locator(".rr-ol pre").click();
		await page.keyboard.press("Control+Enter");
		await page.keyboard.type("after");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("! H\n\np\n\n* a\n* b\n* x\n\n> q\n> r\n\n```\nc\n```\n\nafter\n\nend");
	});

	test("enter at the start of a filled item or paragraph opens an empty one above", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b\n** b1\n\npara" });
		await outlined(page, title);
		const frame = frameOf(page, title);
		// An item with a sub-item: the new item goes above, the sub-item stays with b
		await frame.locator(".rr-ol ul > li").nth(1).click({ position: { x: 5, y: 5 } });
		await page.keyboard.press("Enter");
		await expect.poll(() => editorValue(page)).toBe("b");
		await page.keyboard.press("Home");
		await page.keyboard.press("Enter");
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("");
		expect(await text(page, title)).toBe("* a\n* b\n** b1\n\npara");
		await page.keyboard.type("new");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* a\n* new\n* b\n** b1\n\npara");
		// Typed text in the item is saved first; Escape on the empty one above leaves the rest as it is
		await editItem(page, title, "a");
		await page.keyboard.press("End");
		await page.keyboard.type("!");
		await page.keyboard.press("Home");
		await page.keyboard.press("Enter");
		await expect.poll(() => text(page, title)).toBe("* a!\n* new\n* b\n** b1\n\npara");
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("");
		await page.keyboard.press("Escape");
		await expect(hosts(page)).toHaveCount(0);
		expect(await text(page, title)).toBe("* a!\n* new\n* b\n** b1\n\npara");
		// A paragraph: a paragraph above
		await frame.locator(".rr-ol p").click();
		await page.keyboard.press("Enter");
		await page.keyboard.press("Home");
		await page.keyboard.press("Enter");
		await page.keyboard.type("first");
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* a!\n* new\n* b\n** b1\n\nfirst\n\npara");
	});

	test("alt-enter in the editor offers turn into, the editor stays open", async ({ page, request }) => {
		await createTiddler(request, title, { text: "para one\n\n! H" });
		await outlined(page, title);
		const frame = frameOf(page, title), menu = frame.locator(".rr-ol-menu");
		await frame.locator(".rr-ol p").click();
		await page.keyboard.press("Enter");
		await page.keyboard.press("End");
		await page.keyboard.type(" two");
		await page.keyboard.press("Alt+Enter");
		await expect(menu).toBeVisible();
		await expect(menu.locator(".rr-ol-menu-group")).toHaveText(["Turn into"]);
		await expect.poll(() => text(page, title)).toBe("para one two\n\n! H");
		await menu.locator(".rr-ol-menu-item", { hasText: "Heading 2" }).click();
		await expect.poll(() => text(page, title)).toBe("!! para one two\n\n! H");
		await expect(hosts(page)).toHaveCount(1);
		await expect.poll(() => editorValue(page)).toBe("para one two");
		// Escape closes the menu and goes back to the editor
		await page.keyboard.press("Alt+Enter");
		await expect(menu).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(menu).toHaveCount(0);
		await expect(hosts(page)).toHaveCount(1);
		await page.keyboard.type("!");
		await expect.poll(() => editorValue(page)).toBe("para one two!");
		await page.keyboard.press("Escape");
		// Shift-Enter in selection mode no longer opens the menu
		await frame.locator(".rr-ol h1").click();
		await page.keyboard.press("Shift+Enter");
		await expect(menu).toHaveCount(0);
	});

	test("delete at the end of a list item pulls the next item up", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* a\n* b\n** b1\n* c" });
		await outlined(page, title);
		await editItem(page, title, "a");
		await page.keyboard.press("End");
		await page.keyboard.press("Delete");
		await expect.poll(() => text(page, title)).toBe("* ab\n** b1\n* c");
		await expect.poll(() => editorValue(page)).toBe("ab");
		// The caret is at the join
		await page.keyboard.type("|");
		await expect.poll(() => editorValue(page)).toBe("a|b");
		await page.keyboard.press("Backspace");
		// The first sub-item comes up into its item
		await page.keyboard.press("End");
		await page.keyboard.press("Delete");
		await expect.poll(() => text(page, title)).toBe("* abb1\n* c");
		await page.keyboard.press("Escape");
		// The last item: nothing happens
		await editItem(page, title, "c");
		await page.keyboard.press("End");
		await page.keyboard.press("Delete");
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("c");
		expect(await text(page, title)).toBe("* abb1\n* c");
	});

	test("ctrl-z in an unchanged editor undoes the outline's last step, ctrl-y redoes it", async ({ page, request }) => {
		const start = "* hello world\n* next";
		await createTiddler(request, title, { text: start });
		await outlined(page, title);
		await editItem(page, title, "hello world");
		await page.keyboard.press("Home");
		for(let i = 0; i < 6; i++) { await page.keyboard.press("ArrowRight"); }
		await page.keyboard.press("Enter");
		await expect.poll(() => text(page, title)).toBe("* hello\n* world\n* next");
		await expect.poll(() => editorValue(page)).toBe("world");
		await page.keyboard.press("Control+z");
		await expect.poll(() => text(page, title)).toBe(start);
		await expect(hosts(page)).toHaveCount(1);
		await expect.poll(() => editorValue(page)).toBe("hello world");
		await page.keyboard.press("Control+y");
		await expect.poll(() => text(page, title)).toBe("* hello\n* world\n* next");
		await expect(hosts(page)).toHaveCount(1);
		// With typed text Ctrl-Z stays the editor's own
		await page.keyboard.type("!");
		await page.keyboard.press("Control+z");
		expect(await text(page, title)).toBe("* hello\n* world\n* next");
		await page.keyboard.press("Escape");
	});

	test("the block menu opens below the unit's first visible element (a hidden first element, as a code-block plugin adds)", async ({ page, request }) => {
		// A widget unit whose first element is hidden: the menu must not go to the top of the page
		await createTiddler(request, title, { text: "\\procedure two()\n<div style=\"display:none\">\n\na\n\n</div>\n<div>\n\nb\n\n</div>\n\\end\n\npara\n\n<<two>>\n\nend" });
		await outlined(page, title);
		const frame = frameOf(page, title), menu = frame.locator(".rr-ol-menu");
		const shownNode = frame.locator('.rr-ol [data-ol-kind="widget"]').nth(1);
		await shownNode.click();
		await expect(frame.locator(".rr-ol-selected")).toHaveCount(2);
		await page.keyboard.press("Alt+Enter");
		await expect(menu).toBeVisible();
		const shown = await shownNode.boundingBox();
		const box = await menu.boundingBox();
		expect(box.y).toBeGreaterThanOrEqual(shown.y + shown.height - 1);
		expect(box.y).toBeLessThan(shown.y + shown.height + 20);
	});

	test("the copy flash shows on everything inside the unit, also on a code block's own background", async ({ page, request }) => {
		await createTiddler(request, title, { text: "<div>\n\n```\nx\n```\n\n</div>" });
		await outlined(page, title);
		const frame = frameOf(page, title);
		// The code block, then its parent: the container
		await frame.locator(".rr-ol pre").click();
		await page.keyboard.press("ArrowLeft");
		await expect(frame.locator(".rr-ol > div.rr-ol-selected")).toHaveCount(1);
		await page.keyboard.press("Control+c");
		await expect(frame.locator(".rr-ol-copied")).toHaveCount(1);
		expect(await frame.locator(".rr-ol pre").evaluate((n) => getComputedStyle(n).animationName)).toBe("rr-ol-copied");
	});

	test("ctrl-c/x/v use the system clipboard: html for outside, levels adapted inside, plain text as wikitext", async ({ page, request }) => {
		const other = title + " other";
		extra.push(other, SELECTION + other);
		await createTiddler(request, title, { text: "* a\n** a1 [[L]]\n\n# x\n## y\n\n! H\n\npara\n\n!! S\n\ns" });
		await createTiddler(request, other, { text: "" });
		await outlined(page, title);
		// What reaches the clipboard (read after the outline wrote it)
		await page.evaluate(() => {
			for(const name of ["copy", "cut"]) {
				document.addEventListener(name, (e) => {
					window.__clip = {html: e.clipboardData.getData("text/html"), plain: e.clipboardData.getData("text/plain"),
						own: e.clipboardData.getData("application/x-rimir-outline")};
				});
			}
		});
		const frame = frameOf(page, title), selected = frame.locator(".rr-ol-selected");
		// Copy a with its sub-item: wikitext as plain text, rendered html without classes and tiddler links
		await frame.locator("li").first().click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Control+c");
		await expect(frame.locator(".rr-ol-copied")).toHaveCount(1);
		const clip = await page.evaluate(() => window.__clip);
		expect(clip.plain).toBe("* a\n** a1 [[L]]");
		expect(JSON.parse(clip.own)).toEqual({ kind: "items", source: "* a\n** a1 [[L]]" });
		expect(clip.html).toContain("<ul><li>a<ul><li>a1 L</li></ul></li></ul>");
		// A sub-item copied alone: at level 1 for outside (no empty outer bullet); the outline format keeps its source
		await clickItem(page, title, "y");
		await page.keyboard.press("Control+c");
		const sub = await page.evaluate(() => window.__clip);
		expect(sub.plain).toBe("# y");
		expect(sub.html).toContain("<ol><li>y</li></ol>");
		expect(JSON.parse(sub.own).source).toBe("## y");
		await frame.locator("li").first().click({ position: { x: 30, y: 5 } });
		await page.keyboard.press("Control+c");
		// Paste after ## y: at its level, the sub-item one deeper
		await clickItem(page, title, "y");
		await page.keyboard.press("Control+v");
		await expect.poll(() => text(page, title)).toBe("* a\n** a1 [[L]]\n\n# x\n## y\n## a\n##* a1 [[L]]\n\n! H\n\npara\n\n!! S\n\ns");
		await expect(selected).toHaveText(/^a/);
		// Ctrl-Z takes the paste back
		await page.keyboard.press("Control+z");
		await expect.poll(() => text(page, title)).toBe("* a\n** a1 [[L]]\n\n# x\n## y\n\n! H\n\npara\n\n!! S\n\ns");
		// Cut the section S without a question, paste it after para: one level below H
		await frame.locator(".rr-ol h2").click();
		await page.keyboard.press("Control+x");
		await expect(frame.locator(".rr-ol-menu")).toHaveCount(0);
		await expect.poll(() => text(page, title)).toBe("* a\n** a1 [[L]]\n\n# x\n## y\n\n! H\n\npara");
		await expect(frame.locator(".rr-ol p")).toHaveCount(1);
		await frame.locator(".rr-ol p").click();
		await page.keyboard.press("Control+v");
		await expect.poll(() => text(page, title)).toBe("* a\n** a1 [[L]]\n\n# x\n## y\n\n! H\n\npara\n\n!! S\n\ns");
		await expect(selected).toHaveText("S");
		// The clipboard survives a reload: an empty tiddler gets it at the end
		await outlined(page, other);
		await frameOf(page, other).locator(".rr-ol-empty").click();
		await page.keyboard.press("Control+v");
		await expect.poll(() => text(page, other)).toBe("! S\n\ns");
		// Plain text from outside is taken as wikitext: a list after the heading's line, as a new list
		await page.evaluate(() => {
			const ta = document.createElement("textarea");
			ta.id = "outside";
			ta.value = "** n\n*** m\n";
			document.body.appendChild(ta);
		});
		await page.locator("#outside").focus();
		await page.keyboard.press("Control+a");
		await page.keyboard.press("Control+c");
		await frameOf(page, other).locator(".rr-ol h1").click();
		await page.keyboard.press("Control+v");
		await expect.poll(() => text(page, other)).toBe("! S\n\n* n\n** m\n\ns");
		// The story's dropzone does not import the pastes as tiddlers
		expect(await page.evaluate(() => $tw.wiki.tiddlerExists("$:/Import"))).toBe(false);
		// A copied heading flashes with its whole section (heading, list, paragraph)
		await frameOf(page, other).locator(".rr-ol h1").click();
		await page.keyboard.press("Control+c");
		await expect(frameOf(page, other).locator(".rr-ol-copied")).toHaveCount(3);
	});

	test("double-click on another unit while editing saves and edits that unit", async ({ page, request }) => {
		await createTiddler(request, title, { text: "para\n\n* a\n* b\n\nend" });
		await outlined(page, title);
		const frame = frameOf(page, title);
		await editItem(page, title, "a");
		await page.keyboard.type(" longer");
		await frame.locator(".rr-ol p").last().dblclick();
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("end");
		expect(await text(page, title)).toBe("para\n\n* a longer\n* b\n\nend");
		// Typing goes to the new editor; back up to the paragraph above
		await page.keyboard.type("!");
		await frame.locator(".rr-ol p").first().dblclick();
		await expect(hosts(page)).toHaveCount(1);
		expect(await editorValue(page)).toBe("para");
		expect(await text(page, title)).toBe("para\n\n* a longer\n* b\n\nend!");
	});
});
