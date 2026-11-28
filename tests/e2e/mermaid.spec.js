const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler } = require("./helpers");

// mermaid plugin: a tiddler of type text/vnd.mermaid renders an SVG; invalid source shows the error; a changed text
// re-renders; a $$$ block and an inline transclusion in a list item render too. Tiddlers are named "MMT <test title>".

function frameOf(page, title) {
	return page.locator(`.tc-tiddler-frame[data-tiddler-title="${title}"]`).first();
}

async function open(page, title) {
	await page.goto("/");
	await waitForTW(page);
	await navigateToTiddler(page, title);
}

test.describe("mermaid", () => {
	let title;
	const extra = [];

	test.beforeEach(async ({}, testInfo) => {
		title = "MMT " + testInfo.title;
		extra.length = 0;
	});

	test.afterEach(async ({ request }) => {
		for(const t of [title].concat(extra)) {
			await deleteTiddler(request, t);
		}
	});

	test("a tiddler of the type renders an svg; a changed text re-renders", async ({ page, request }) => {
		await createTiddler(request, title, { type: "text/vnd.mermaid", text: "flowchart LR\n  a --> b" });
		await open(page, title);
		const svg = frameOf(page, title).locator(".rr-mm svg");
		await expect(svg).toHaveCount(1);
		await expect(svg.locator("g.node")).toHaveCount(2);
		await page.evaluate((t) => $tw.wiki.setText(t, "text", null, "flowchart LR\n  a --> b --> c"), title);
		await expect(frameOf(page, title).locator(".rr-mm svg g.node")).toHaveCount(3);
	});

	test("invalid source shows the error message", async ({ page, request }) => {
		await createTiddler(request, title, { type: "text/vnd.mermaid", text: "flowchart LR\n  a -->" });
		await open(page, title);
		await expect(frameOf(page, title).locator(".rr-mm-error")).toBeVisible();
		await expect(frameOf(page, title).locator(".rr-mm svg")).toHaveCount(0);
	});

	test("a $$$ block and an inline transclusion in a list item", async ({ page, request }) => {
		const graph = title + " graph";
		extra.push(graph);
		await createTiddler(request, graph, { type: "text/vnd.mermaid", text: "flowchart LR\n  x --> y" });
		await createTiddler(request, title, { text: "$$$text/vnd.mermaid\nflowchart LR\n  p --> q\n$$$\n\n* item {{" + graph + "}}" });
		await open(page, title);
		await expect(frameOf(page, title).locator("div.rr-mm svg")).toHaveCount(1);
		await expect(frameOf(page, title).locator("li span.rr-mm svg")).toHaveCount(1);
	});

	test("every shipped example renders", async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		const examples = await page.evaluate(() => $tw.wiki.filterTiddlers("[all[shadows+tiddlers]tag[$:/tags/rimir/outline/Snippet]field:for[mermaid]]"));
		expect(examples.length).toBeGreaterThan(4);
		for(const example of examples) {
			const t = title + " " + example.split("/").pop();
			extra.push(t);
			await page.evaluate(([t, ex]) => $tw.wiki.addTiddler({title: t, type: "text/vnd.mermaid", text: $tw.wiki.getTiddlerText(ex)}), [t, example]);
			await navigateToTiddler(page, t);
			const frame = frameOf(page, t);
			await expect(frame.locator(".rr-mm svg"), example).toHaveCount(1);
			await expect(frame.locator(".rr-mm-error"), example).toHaveCount(0);
		}
	});
});
