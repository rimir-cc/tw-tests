const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler, wakeOutline } = require("./helpers");

// Outline with a registered typed block type (the graphviz plugin): $$$ blocks from the block menu, turn into and back,
// "Add to this item" on a bullet (the diagram tiddler is created on the first save), editing a diagram in place.
// Tiddlers are named "OLD <test title>".

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

const STARTER = "digraph {\n  a -> b\n}";

test.describe("outline diagrams", () => {
	let title;
	const extra = [];

	test.beforeEach(async ({}, testInfo) => {
		title = "OLD " + testInfo.title;
		extra.length = 0;
	});

	test.afterEach(async ({ request }) => {
		for(const t of [title].concat(extra)) {
			await deleteTiddler(request, t);
		}
		await deleteTiddler(request, "$:/temp/rimir/outline/selection/" + title);
	});

	test("insert a graphviz block from the block menu; it renders with its badge", async ({ page, request }) => {
		await createTiddler(request, title, { text: "para" });
		await outlined(page, title);
		const menu = frameOf(page, title).locator(".rr-ol-menu");
		await frameOf(page, title).locator(".rr-ol p").click();
		await page.keyboard.press("Alt+Enter");
		await menu.locator(".rr-ol-menu-item", { hasText: "Graphviz graph" }).first().click();
		const field = frameOf(page, title).locator(".rr-ol-editor-host textarea");
		await expect(field).toHaveValue(STARTER);
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("para\n\n$$$text/vnd.graphviz\n" + STARTER + "\n$$$");
		await expect(frameOf(page, title).locator(".rr-gv svg")).toHaveCount(1);
		await expect(frameOf(page, title).locator("[data-ol-type=graphviz]")).toHaveAttribute("data-ol-typed", "yes");
		// Edited without the $$$ lines
		await frameOf(page, title).locator(".rr-gv").dblclick();
		await expect(field).toHaveValue(STARTER);
		await page.keyboard.press("Escape");
	});

	test("a code block turns into a graphviz block and back", async ({ page, request }) => {
		await createTiddler(request, title, { text: "```\ndigraph { x -> y }\n```" });
		await outlined(page, title);
		const menu = frameOf(page, title).locator(".rr-ol-menu");
		await frameOf(page, title).locator(".rr-ol pre").click();
		await page.keyboard.press("Alt+Enter");
		await menu.locator(".rr-ol-menu-item", { hasText: "Graphviz graph" }).last().click();
		await expect.poll(() => text(page, title)).toBe("$$$text/vnd.graphviz\ndigraph { x -> y }\n$$$");
		await expect(frameOf(page, title).locator(".rr-gv svg")).toHaveCount(1);
		await frameOf(page, title).locator(".rr-gv").click();
		await page.keyboard.press("Alt+Enter");
		await menu.locator(".rr-ol-menu-item", { hasText: "Code block" }).last().click();
		await expect.poll(() => text(page, title)).toBe("```\ndigraph { x -> y }\n```");
	});

	test("add a graph to a bullet: created on the first save; a double-click edits it in an overlay with a live preview", async ({ page, request }) => {
		const graph = title + "/graphs/graphviz1";
		extra.push(graph);
		await createTiddler(request, title, { text: "* Build pipeline\n* b" });
		await outlined(page, title);
		const menu = frameOf(page, title).locator(".rr-ol-menu");
		await frameOf(page, title).locator(".rr-ol li").first().click();
		await page.keyboard.press("Alt+Enter");
		await menu.locator(".rr-ol-menu-group", { hasText: "Add to this item" }).waitFor();
		await menu.locator(".rr-ol-menu-item", { hasText: "Graphviz graph" }).first().click();
		const host = frameOf(page, title).locator(".rr-ol-target-editor");
		await expect(host).toHaveCount(1);
		await expect(host.locator("textarea")).toHaveValue(STARTER);
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), graph)).toBe(false);
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, title)).toBe("* Build pipeline {{" + graph + "}}\n* b");
		expect(await page.evaluate((t) => $tw.wiki.getTiddler(t).fields.type, graph)).toBe("text/vnd.graphviz");
		const svg = frameOf(page, title).locator("li span.rr-gv svg");
		await expect(svg).toHaveCount(1);
		// Double-click on the graph: the overlay with its code and a live preview; Escape changes nothing
		const svg0 = frameOf(page, title).locator(".rr-ol > ul li span.rr-gv svg");
		await svg0.dblclick();
		const overlay = frameOf(page, title).locator(".rr-ol-overlay");
		await expect(overlay.locator("textarea.rr-ol-overlay-code")).toHaveValue(STARTER);
		await expect(overlay).toHaveCSS("border-top-color", "rgb(232, 128, 12)");
		await overlay.locator("textarea").fill("digraph { a -> b -> c }");
		// The preview follows the typing, the diagram does not change yet
		await expect(overlay.locator(".rr-ol-overlay-preview svg g.node")).toHaveCount(3);
		expect(await text(page, graph)).toBe(STARTER);
		await page.keyboard.press("Escape");
		await expect(overlay).toHaveCount(0);
		expect(await text(page, graph)).toBe(STARTER);
		// Shift-Enter on the bullet opens the same overlay; Ctrl-Enter saves
		await page.keyboard.press("Shift+Enter");
		await overlay.locator("textarea").fill("digraph { a -> b -> c }");
		await page.keyboard.press("Control+Enter");
		await expect(overlay).toHaveCount(0);
		await expect.poll(() => text(page, graph)).toBe("digraph { a -> b -> c }");
		await expect(frameOf(page, title).locator(".rr-ol > ul li span.rr-gv svg g.node")).toHaveCount(3);
		expect(await text(page, title)).toBe("* Build pipeline {{" + graph + "}}\n* b");
	});

	test("the diagram overlay offers the type's examples (replace the code, preview only) and its docs link", async ({ page, request }) => {
		const graph = title + " graph";
		extra.push(graph);
		await createTiddler(request, graph, { type: "text/vnd.graphviz", text: "digraph { a -> b }" });
		await createTiddler(request, title, { text: "* a {{" + graph + "}}\n* b" });
		await outlined(page, title);
		await frameOf(page, title).locator(".rr-ol li").first().click({ position: { x: 5, y: 5 } });
		await page.keyboard.press("Shift+Enter");
		const overlay = frameOf(page, title).locator(".rr-ol-overlay");
		await expect(overlay.locator("a.rr-ol-diagram-docs")).toHaveAttribute("href", "https://graphviz.org/documentation/");
		const picker = overlay.locator("select.rr-ol-diagram-examples");
		// (a click on the list moves the focus there; TiddlyWiki does not rewrite a focused text field)
		await picker.focus();
		await picker.selectOption({ label: "Colours and shapes" });
		await expect(overlay.locator("textarea.rr-ol-overlay-code")).toHaveValue(/fillcolor=palegreen/);
		await expect(overlay.locator(".rr-ol-overlay-preview svg g.node")).toHaveCount(4);
		// The picker is back on "Examples"; the diagram itself is unchanged until Ctrl-Enter
		await expect(picker).toHaveValue("");
		expect(await text(page, graph)).toBe("digraph { a -> b }");
		await overlay.locator("textarea.rr-ol-overlay-code").focus();
		await page.keyboard.press("Control+Enter");
		await expect.poll(() => text(page, graph)).toMatch(/fillcolor=palegreen/);
	});

	test("escape on a new graph for a bullet creates nothing", async ({ page, request }) => {
		await createTiddler(request, title, { text: "* point\n* b" });
		await outlined(page, title);
		const menu = frameOf(page, title).locator(".rr-ol-menu");
		await frameOf(page, title).locator(".rr-ol li").first().click();
		await page.keyboard.press("Alt+Enter");
		await menu.locator(".rr-ol-menu-item", { hasText: "Graphviz graph" }).first().click();
		await expect(frameOf(page, title).locator(".rr-ol-target-editor")).toHaveCount(1);
		await page.keyboard.press("Escape");
		await expect(frameOf(page, title).locator(".rr-ol-target-editor")).toHaveCount(0);
		expect(await text(page, title)).toBe("* point\n* b");
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t + "/graphs/graphviz1"), title)).toBe(false);
	});

	test("a click on a graph in a bullet selects the bullet and stays in the tiddler", async ({ page, request }) => {
		const graph = title + " graph";
		extra.push(graph, "$:/temp/rimir/outline/selection/" + graph);
		await createTiddler(request, graph, { type: "text/vnd.graphviz", text: "digraph { a -> b }" });
		await createTiddler(request, title, { text: "* a {{" + graph + "}}\n* b" });
		await outlined(page, title);
		await frameOf(page, title).locator("li span.rr-gv svg").click();
		await expect(frameOf(page, title).locator("li.rr-ol-selected")).toHaveCount(1);
		await expect(page.locator(`.tc-tiddler-frame[data-tiddler-title="${graph}"]`)).toHaveCount(0);
	});

	test("a wikitext transclusion holding a graph opens in its overlay, not as a graph", async ({ page, request }) => {
		const notes = title + " notes", graph = title + " graph";
		extra.push(notes, graph, "$:/temp/rimir/outline/selection/" + notes);
		await createTiddler(request, graph, { type: "text/vnd.graphviz", text: "digraph { a -> b }" });
		await createTiddler(request, notes, { text: "n {{" + graph + "}}" });
		await createTiddler(request, title, { text: "para\n\n{{" + notes + "}}" });
		await outlined(page, title);
		await expect(frameOf(page, title).locator("[data-ol-diagram-target]")).toHaveCount(0);
		await frameOf(page, title).locator(".rr-ol p").first().click();
		await page.keyboard.press("ArrowDown");
		await page.keyboard.press("Shift+Enter");
		await expect(frameOf(page, title).locator(".rr-ol-target-editor")).toHaveCount(0);
		await expect(frameOf(page, title).locator(`.rr-ol-overlay .rr-ol.rr-ol-awake[data-ol-tiddler="${notes}"]`)).toHaveCount(1);
	});

	test("a wikitext transclusion in a bullet is not marked", async ({ page, request }) => {
		const other = title + " other";
		extra.push(other);
		await createTiddler(request, other, { text: "other" });
		await createTiddler(request, title, { text: "* a {{" + other + "}}\n* b" });
		await outlined(page, title);
		await expect(frameOf(page, title).locator("[data-ol-diagram-target]")).toHaveCount(0);
	});
});
