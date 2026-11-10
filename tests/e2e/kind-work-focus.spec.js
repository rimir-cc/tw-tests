const { test, expect } = require("@playwright/test");
const { waitForTW } = require("./helpers");

// Fixtures live under $:/temp/ so the syncer never writes them to the shared pw-edition server;
// afterEach sweeps them. The fixture kinds mirror the bridge's Jasmine helpers.
const P = "$:/temp/kwf/";
const AREA = P + "area";
const TOPIC = P + "inst/Topic";
const TASK = P + "inst/Task";
const ME = P + "inst/Meg";
const NEW = P + "inst/Fresh";
const ME_CFG = "$:/config/rimir/kind-work-focus/me";
const GM = "$:/state/rimir/kind/graph-modal";
const DRAFT = GM + "/draft";
const STATE = [
	"$:/temp/rimir/work-focus/snapshot",
	"$:/temp/rimir/work-focus/acted",
	"$:/temp/rimir/work-focus/open",
	"$:/temp/rimir/work-focus/show-muted",
	"$:/rimir/work-focus/mutes",
	"$:/state/rimir/work-focus/tab",
	"$:/config/rimir/work-focus/position",
	"$:/tags/rimir/work-focus/area",
	"$:/palette",
	ME_CFG, GM, DRAFT,
	"$:/state/rimir/kind/__graph-created",
];

const FIELDS = {
	"kwf-person": [{ key: "caption", typed: "text" }],
	"kwf-topic": [{ key: "caption", typed: "text" }],
	"kwf-task": [
		{ key: "caption", typed: "text" },
		{ key: "parent", typed: "ref", cardinality: "single", "ref-types": ["kwf-topic"] },
		{ key: "assignee", typed: "ref", cardinality: "single", "ref-types": ["kwf-person"] },
	],
};
const EXTRA = {
	"kwf-topic": { "kind.spawns": "kwf-task", "kind.caption": "Topic" },
	"kwf-task": { "kind.parent-kinds": "kwf-topic", "kind.caption": "Task" },
};

async function addTiddlers(page, list) {
	await page.evaluate((list) => list.forEach((f) => $tw.wiki.addTiddler(new $tw.Tiddler(f))), list);
}

async function check(page) {
	await page.evaluate(() => $tw.rootWidget.invokeActionString("<$action-wf-check/>"));
}

async function sweep(page) {
	const left = await page.evaluate(({ P, STATE }) => {
		$tw.wiki.filterTiddlers(`[prefix[${P}]]`).forEach((t) => $tw.wiki.deleteTiddler(t));
		STATE.forEach((t) => $tw.wiki.deleteTiddler(t));
		return $tw.wiki.filterTiddlers(`[prefix[${P}]]`).concat(STATE.filter((t) => $tw.wiki.tiddlerExists(t)));
	}, { P, STATE });
	expect(left).toEqual([]);
}

// Fixture kinds, an area listing `items`, the persons; panel open. Returns the panel rows.
async function setup(page, items) {
	const types = Object.keys(FIELDS).map((key) => ({
		title: P + "type/" + key, "kind.type": key, "kind.fields": JSON.stringify(FIELDS[key]),
		"kind.title-formula": `[[${P}inst/]] [get[caption]] +[join[]]`, ...EXTRA[key],
	}));
	await addTiddlers(page, [
		...types,
		{ title: ME, "kind.type": "kwf-person", caption: "Meg" },
		{ title: ME_CFG, text: ME },
		{ title: TOPIC, "kind.type": "kwf-topic", caption: "The Topic", tags: "KwfTest" },
		{ title: TASK, "kind.type": "kwf-task", caption: "A Task", tags: "KwfTest" },
		{ title: AREA, tags: "$:/tags/rimir/work-focus/area", caption: "Kwf", "wf.level": "alert", "wf.filter": items },
	]);
	await check(page);
	await page.locator(".wf-dock-toggle").click();
	await expect(page.locator(".wf-panel")).toBeVisible();
}

const row = (page, title) => page.locator(`.wf-panel .wf-item[data-wf-item="${title}"]`);
const group = (page, name) => page.locator(`.wf-ring .wf-tile[data-wf-kind="group"][data-wf-group="${name}"]`);
const modal = (page) => page.locator(".kind-graph-modal-panel");

async function centre(locator) {
	const b = await locator.boundingBox();
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

// Press on the row and move past the drag threshold
async function drag(page, locator) {
	const c = await centre(locator);
	await page.mouse.move(c.x, c.y);
	await page.mouse.down();
	await page.mouse.move(c.x + 30, c.y, { steps: 4 });
}

async function hover(page, locator, ms) {
	const c = await centre(locator);
	await page.mouse.move(c.x, c.y, { steps: 6 });
	if (ms) await page.waitForTimeout(ms);
}

// Drag the topic row onto Create (> Task) and release
async function dragToCreateTask(page) {
	await drag(page, row(page, TOPIC));
	// the topic offers one Create tile: the group runs it when released on the group tile
	await hover(page, group(page, "create"), 200);
	await expect(page.locator(".wf-ring .wf-hint")).toContainText("opens the Task form");
	await page.mouse.up();
	await expect(page.locator(".wf-ring")).toHaveCount(0);
	await expect(modal(page)).toBeVisible();
}

// The click on a modal button counts as outside the panel and closes it
async function reopenPanel(page) {
	if (!(await page.locator(".wf-panel").count())) await page.locator(".wf-dock-toggle").click();
	await expect(page.locator(".wf-panel")).toBeVisible();
}

const field = (page, title, name) => page.evaluate(([t, n]) => { const x = $tw.wiki.getTiddler(t); return x ? x.fields[n] : undefined; }, [title, name]);
// the snapshot stores the check time to the millisecond (the dock shows minutes only)
const checkTime = (page) => page.evaluate(() => ($tw.wiki.getTiddlerData("$:/temp/rimir/work-focus/snapshot", {}) || {}).checked);

test.describe("kind-work-focus", () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto("/");
		await waitForTW(page);
		await sweep(page);
	});

	test.afterEach(async ({ page }) => {
		await page.mouse.up().catch(() => {});
		await sweep(page);
	});

	test("drag a topic onto Create > Task opens the form prefilled", async ({ page }) => {
		await setup(page, "[tag[KwfTest]kind.type[kwf-topic]]");
		await dragToCreateTask(page);
		await expect(modal(page).locator(".kind-graph-modal-header")).toContainText("Task");
		expect(await field(page, DRAFT, "parent")).toBe(TOPIC);
		expect(await field(page, DRAFT, "assignee")).toBe(ME);
		// the form shows both values
		await expect(modal(page)).toContainText("The Topic");
		await expect(modal(page)).toContainText("Meg");
		await expect(row(page, TOPIC)).not.toHaveClass(/wf-acted/);
	});

	test("save marks the row and refreshes", async ({ page }) => {
		await setup(page, "[tag[KwfTest]kind.type[kwf-topic]]");
		await dragToCreateTask(page);
		await modal(page).locator("input[type=text]").first().fill("Fresh");
		const before = await checkTime(page);
		await page.waitForTimeout(50);
		await modal(page).getByRole("button", { name: "Create", exact: true }).click();
		await expect(modal(page)).toHaveCount(0);
		await expect.poll(() => field(page, NEW, "kind.type")).toBe("kwf-task");
		expect(await field(page, NEW, "parent")).toBe(TOPIC);
		expect(await field(page, NEW, "assignee")).toBe(ME);
		await expect.poll(() => checkTime(page)).not.toBe(before);
		await reopenPanel(page);
		await expect(page.locator(`.wf-panel .wf-item.wf-acted[data-wf-item="${TOPIC}"]`)).toContainText("＋ Fresh");
	});

	test("cancel leaves the row unmarked", async ({ page }) => {
		await setup(page, "[tag[KwfTest]kind.type[kwf-topic]]");
		const before = await checkTime(page);
		await page.waitForTimeout(50);
		await dragToCreateTask(page);
		await modal(page).getByRole("button", { name: "Cancel", exact: true }).click();
		await expect(modal(page)).toHaveCount(0);
		expect(await checkTime(page)).toBe(before);
		await reopenPanel(page);
		await expect(row(page, TOPIC)).toBeVisible();
		await expect(page.locator(".wf-panel .wf-item.wf-acted")).toHaveCount(0);
		await expect(row(page, TOPIC)).not.toContainText("＋");
		expect(await field(page, NEW, "kind.type")).toBeUndefined();
	});

	test("assign to me sets the assignee and marks the row", async ({ page }) => {
		await setup(page, "[tag[KwfTest]kind.type[kwf-task]]");
		await drag(page, row(page, TASK));
		// a group with one tile-less action runs it when released on the group tile
		await hover(page, group(page, "status"), 200);
		await expect(page.locator(".wf-ring .wf-hint")).toContainText("assignee becomes Meg");
		await page.mouse.up();
		await expect(page.locator(".wf-ring")).toHaveCount(0);
		expect(await field(page, TASK, "assignee")).toBe(ME);
		await expect(page.locator(`.wf-panel .wf-item.wf-acted[data-wf-item="${TASK}"]`)).toContainText("→ Meg");
	});
});
