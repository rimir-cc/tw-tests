const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler, openEditor, getDraftFrame,
	createTiddlerInBrowser } = require("./helpers");

const NOTE = "E2E llm-inline note";
const CONFIG = {
	"$:/config/rimir/llm-connect/default-connection": "mock",
	"$:/config/rimir/llm-connect/connections/mock": {
		tags: "$:/tags/rimir/llm-connect/connection", "connection-id": "mock", "connection-name": "Mock",
		"connection-type": "openai-compatible", endpoint: "http://llm.mock/v1", model: "mock"
	},
	"$:/config/rimir/llm-connect/protection-mode": "deny",
	"$:/config/rimir/llm-inline/tools": ""
};
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS"
};

function completion(content) {
	return JSON.stringify({ choices: [{ message: { role: "assistant", content } }] });
}

// Mock provider. `answers` is a list of strings (or functions returning a promise of string);
// requests are recorded in `requests`.
async function mockProvider(page, answers) {
	const requests = [];
	await page.route("http://llm.mock/v1/chat/completions", async (route) => {
		const req = route.request();
		if (req.method() === "OPTIONS") {
			return route.fulfill({ status: 204, headers: CORS });
		}
		requests.push(req.postData() || "");
		const next = answers[requests.length - 1];
		const content = typeof next === "function" ? await next() : next;
		await route.fulfill({ status: 200, headers: { ...CORS, "Content-Type": "application/json" }, body: completion(content) });
	});
	return requests;
}

function held() {
	let release;
	const promise = new Promise((r) => { release = r; });
	return { promise, release };
}

async function typeAndSave(page, title, text) {
	await openEditor(page, title);
	const draft = getDraftFrame(page, title);
	await draft.frameLocator("iframe.tc-edit-texteditor").locator("textarea").fill(text);
	// The edit toolbar can render two confirm buttons (overflow measuring), so click the first.
	await draft.locator('button[aria-label="Confirm changes to this tiddler"]').first().click();
	await page.waitForSelector(`.tc-tiddler-frame[data-tiddler-title="${title}"]:not([data-tiddler-title*="Draft"])`);
}

async function cleanup(page) {
	await page.evaluate(({ note, cfg }) => {
		var titles = $tw.wiki.filterTiddlers("[prefix[" + note + "]] [prefix[Draft of '" + note + "']] [[$:/temp/x]] [prefix[Draft of '$:/temp/x']] [all[tiddlers]prefix[$:/rimir/llm-inline/]]");
		titles.forEach((t) => $tw.wiki.deleteTiddler(t));
		Object.keys(cfg).forEach((t) => $tw.wiki.deleteTiddler(t));
		$tw.wiki.addTiddler({ title: "$:/StoryList", text: "", list: "" });
	}, { note: NOTE, cfg: CONFIG });
	// Let the syncer flush the deletions to the server before the page closes,
	// otherwise files stay behind in pw-edition/tiddlers and pollute later runs.
	await page.waitForFunction(() => !$tw.syncer.isDirty());
}

async function setup(page) {
	for (const [title, value] of Object.entries(CONFIG)) {
		await createTiddlerInBrowser(page, title, typeof value === "string" ? { text: value } : value);
	}
}

test.describe("llm-inline end-to-end (mocked provider)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		await setup(page);
		await createTiddlerInBrowser(page, NOTE, { text: "start" });
		await navigateToTiddler(page, NOTE);
	});

	test.afterEach(async ({ page }) => {
		await cleanup(page);
	});

	test("two AI lines run in order and render results", async ({ page }) => {
		const requests = await mockProvider(page, ["R1", "R2"]);
		await typeAndSave(page, NOTE, "intro\nAI: first\nAI: second");
		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${NOTE}"]`);
		await expect(frame.locator(".lli-slot")).toHaveCount(2);
		await expect(frame.locator(".lli-slot").nth(0)).toHaveClass(/lli-done/);
		await expect(frame.locator(".lli-slot").nth(1)).toHaveClass(/lli-done/);
		await expect(frame.locator(".lli-slot").nth(0)).toContainText("R1");
		await expect(frame.locator(".lli-slot").nth(1)).toContainText("R2");
		expect(requests.length).toBe(2);
		expect(requests[1]).toContain("R1");
	});

	test("stop marks slot stopped", async ({ page }) => {
		const gate = held();
		const requests = await mockProvider(page, [() => gate.promise.then(() => "R1")]);
		await typeAndSave(page, NOTE, "intro\nAI: first");
		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${NOTE}"]`);
		await expect(frame.locator(".lli-slot.lli-running")).toHaveCount(1);
		// Stop only once the request is really in flight at the provider.
		await expect.poll(() => requests.length).toBe(1);
		await frame.locator(".lli-stop").click();
		await expect(frame.locator(".lli-slot.lli-stopped")).toHaveCount(1);
		gate.release();
		await page.waitForTimeout(500);
		await expect(frame.locator(".lli-slot.lli-stopped")).toHaveCount(1);
		await expect(frame.locator(".lli-slot")).not.toContainText("R1");
		expect(requests.length).toBe(1);
	});

	test("inline replaces slot with plain text", async ({ page }) => {
		await mockProvider(page, ["R1"]);
		await typeAndSave(page, NOTE, "intro\nAI: first");
		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${NOTE}"]`);
		const slot = frame.locator(".lli-slot.lli-done");
		await expect(slot).toHaveCount(1);
		await slot.hover();
		await slot.locator(".lli-inline").click();
		await expect(frame.locator(".lli-slot")).toHaveCount(0);
		const state = await page.evaluate((n) => ({
			text: $tw.wiki.getTiddlerText(n),
			ph: $tw.wiki.filterTiddlers("[prefix[" + n + "/ai/]]")
		}), NOTE);
		expect(state.text.split("\n")).toEqual(["intro", "R1"]);
		expect(state.ph).toEqual([]);
	});

	test("removing the slot line deletes the placeholder", async ({ page }) => {
		await mockProvider(page, ["R1"]);
		await typeAndSave(page, NOTE, "intro\nAI: first");
		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${NOTE}"]`);
		await expect(frame.locator(".lli-slot.lli-done")).toHaveCount(1);
		const ph = `${NOTE}/ai/1`;
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), ph)).toBe(true);
		await typeAndSave(page, NOTE, "intro");
		await expect.poll(() => page.evaluate((t) => $tw.wiki.tiddlerExists(t), ph)).toBe(false);
		await expect(frame.locator(".lli-slot")).toHaveCount(0);
	});

	test("system tiddler is not processed", async ({ page }) => {
		const requests = await mockProvider(page, ["R1"]);
		await createTiddlerInBrowser(page, "$:/temp/x", { text: "start" });
		await navigateToTiddler(page, "$:/temp/x");
		await typeAndSave(page, "$:/temp/x", "AI: y");
		await page.waitForTimeout(500);
		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/temp/x"]');
		await expect(frame.locator(".lli-slot")).toHaveCount(0);
		expect(requests.length).toBe(0);
		expect(await page.evaluate(() => $tw.wiki.getTiddlerText("$:/temp/x"))).toBe("AI: y");
	});
});
