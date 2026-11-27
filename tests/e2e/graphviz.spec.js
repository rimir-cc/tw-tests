const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler } = require("./helpers");

// graphviz plugin: a tiddler of type text/vnd.graphviz renders an SVG; invalid source shows the error; a changed text
// re-renders; a $$$ block and an inline transclusion in a list item render too. Tiddlers are named "GVT <test title>".

function frameOf(page, title) {
	return page.locator(`.tc-tiddler-frame[data-tiddler-title="${title}"]`).first();
}

async function open(page, title) {
	await page.goto("/");
	await waitForTW(page);
	await navigateToTiddler(page, title);
}

test.describe("graphviz", () => {
	let title;
	const extra = [];

	test.beforeEach(async ({}, testInfo) => {
		title = "GVT " + testInfo.title;
		extra.length = 0;
	});

	test.afterEach(async ({ request }) => {
		for(const t of [title].concat(extra)) {
			await deleteTiddler(request, t);
		}
	});

	test("a tiddler of the type renders an svg; a changed text re-renders", async ({ page, request }) => {
		await createTiddler(request, title, { type: "text/vnd.graphviz", text: "digraph { a -> b }" });
		await open(page, title);
		const svg = frameOf(page, title).locator(".rr-gv svg");
		await expect(svg).toHaveCount(1);
		await expect(svg.locator("g.node")).toHaveCount(2);
		await page.evaluate((t) => $tw.wiki.setText(t, "text", null, "digraph { a -> b -> c }"), title);
		await expect(frameOf(page, title).locator(".rr-gv svg g.node")).toHaveCount(3);
	});

	test("invalid source shows the error message", async ({ page, request }) => {
		await createTiddler(request, title, { type: "text/vnd.graphviz", text: "digraph { a -> }" });
		await open(page, title);
		await expect(frameOf(page, title).locator(".rr-gv-error")).toBeVisible();
		await expect(frameOf(page, title).locator(".rr-gv svg")).toHaveCount(0);
	});

	test("a $$$ block and an inline transclusion in a list item", async ({ page, request }) => {
		const graph = title + " graph";
		extra.push(graph);
		await createTiddler(request, graph, { type: "text/vnd.graphviz", text: "digraph { x -> y }" });
		await createTiddler(request, title, { text: "$$$text/vnd.graphviz\ndigraph { p -> q }\n$$$\n\n* item {{" + graph + "}}" });
		await open(page, title);
		await expect(frameOf(page, title).locator("div.rr-gv svg")).toHaveCount(1);
		await expect(frameOf(page, title).locator("li span.rr-gv svg")).toHaveCount(1);
	});
});
