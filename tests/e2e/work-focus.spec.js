const { test, expect } = require("@playwright/test");
const { waitForTW, deleteTiddler } = require("./helpers");

// Fixtures live under $:/temp/ so the syncer never writes them to the shared
// pw-edition server; afterEach sweeps them.
const AREA = "$:/temp/wftest/area/";
const ITEM = "$:/temp/wftest/item ";
const CONF = "$:/temp/wftest/conf/";
const STATE = [
	"$:/temp/rimir/work-focus/snapshot",
	"$:/temp/rimir/work-focus/acted",
	"$:/rimir/work-focus/mutes",
	"$:/temp/rimir/work-focus/open",
	"$:/state/rimir/work-focus/tab",
	"$:/temp/rimir/work-focus/show-muted",
	"$:/palette",
	"$:/config/rimir/work-focus/position",
];

// Local YYYYMMDD n days from today (matches dates.js local calendar days).
function dayExpr(n) {
	return `(() => { var d = new Date(); d.setDate(d.getDate() + (${n})); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); })()`;
}

async function addTiddlers(page, list) {
	await page.evaluate((list) => {
		list.forEach((f) => $tw.wiki.addTiddler(new $tw.Tiddler(f)));
	}, list);
}

async function check(page) {
	await page.evaluate(() => $tw.rootWidget.invokeActionString("<$action-wf-check/>"));
}

async function area(page, name, fields) {
	await addTiddlers(page, [{ title: AREA + name, tags: "$:/tags/rimir/work-focus/area", ...fields }]);
}

// Removes fixtures and state; state/config tiddlers are synced: let the deletions reach the server
async function sweep(page) {
	// no catch: a failing cleanup must fail the spec, not leave fixtures behind silently
	const left = await page.evaluate(({ AREA, ITEM, CONF, STATE }) => {
		const filter = `[prefix[${AREA}]] [prefix[${ITEM}]] [prefix[${CONF}]] [prefix[$:/temp/rimir/work-focus/more/]]`;
		$tw.wiki.filterTiddlers(filter).forEach((t) => $tw.wiki.deleteTiddler(t));
		STATE.forEach((t) => $tw.wiki.deleteTiddler(t));
		return $tw.wiki.filterTiddlers(filter).concat(STATE.filter((t) => $tw.wiki.tiddlerExists(t)));
	}, { AREA, ITEM, CONF, STATE });
	expect(left).toEqual([]);
	await page.waitForFunction(() => !$tw.syncer || !$tw.syncer.isDirty(), null, { timeout: 5000 }).catch(() => {});
	// a save still in flight from a page left by goto() can re-create a synced tiddler: delete on the server too
	for (const title of STATE.filter((t) => !t.startsWith("$:/temp/"))) {
		await deleteTiddler(page.request, title).catch(() => {});
	}
}

const dock = (page) => page.locator(".wf-layer .wf-dock");
const chips = (page) => page.locator(".wf-layer .wf-dock .wf-chip");

test.describe("work-focus dock and panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		// leftovers of an aborted run (synced config/state) would skew every spec
		await sweep(page);
		// shipped defaults: enabled yes, position top-left
		await expect(page.locator(".wf-layer.wf-pos-top-left")).toHaveCount(1);
	});

	test.afterEach(async ({ page }) => sweep(page));

	test("dock shows one count per area", async ({ page }) => {
		// hint area first in tag order: the alert chip must still come first
		await area(page, "a-hint", { caption: "Active", "wf.level": "hint", "wf.filter": "[tag[WFTestHint]]" });
		await area(page, "b-alert", { caption: "Overdue", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await addTiddlers(page, [
			{ title: ITEM + "a1", tags: "WFTestAlert" },
			{ title: ITEM + "a2", tags: "WFTestAlert" },
			{ title: ITEM + "h1", tags: "WFTestHint" },
		]);
		await check(page);
		await expect(chips(page)).toHaveCount(2);
		await expect(chips(page).nth(0)).toContainText("2");
		await expect(chips(page).nth(0)).toHaveClass(/wf-level-alert/);
		await expect(chips(page).nth(1)).toContainText("1");
		await expect(chips(page).nth(1)).toHaveClass(/wf-level-hint/);
		await expect(dock(page).locator(".wf-dock-time")).toHaveText(/^\d\d:\d\d$/);
	});

	test("empty dock shows a muted check mark", async ({ page }) => {
		await check(page);
		await expect(chips(page)).toHaveCount(0);
		await expect(dock(page).locator(".wf-chip-none")).toHaveText("✓");
	});

	test("panel lists caption, else subtitle, else title with the info line", async ({ page }) => {
		const yesterday = await page.evaluate(dayExpr(-1));
		await area(page, "alert", {
			caption: "Overdue",
			"wf.level": "alert",
			"wf.filter": "[tag[WFTestAlert]]",
			"wf.date-field": "due",
			"wf.info": "date-relative field:parent",
			"wf.when-past": "overdue <<n>>d",
		});
		await addTiddlers(page, [
			{ title: ITEM + "Topic", caption: "Topic caption" },
			{ title: ITEM + "c", tags: "WFTestAlert", caption: "With caption", due: yesterday, parent: ITEM + "Topic" },
			{ title: ITEM + "s", tags: "WFTestAlert", subtitle: "With subtitle", due: yesterday },
			{ title: ITEM + "t", tags: "WFTestAlert", due: yesterday },
		]);
		await check(page);
		await page.locator(".wf-dock-toggle").click();
		const panel = page.locator(".wf-panel");
		await expect(panel).toBeVisible();
		await expect(panel.locator(".wf-section-head")).toContainText("Overdue");
		const rows = panel.locator(".wf-item");
		await expect(rows).toHaveCount(3);
		const c = panel.locator(`.wf-item[data-wf-item="${ITEM}c"]`);
		await expect(c.locator(".wf-item-label")).toHaveText("With caption");
		await expect(c.locator(".wf-item-info")).toContainText("overdue 1d");
		await expect(c.locator(".wf-item-info")).toContainText("Topic caption");
		await expect(c).toHaveAttribute("data-wf-area", AREA + "alert");
		await expect(panel.locator(`.wf-item[data-wf-item="${ITEM}s"] .wf-item-label`)).toHaveText("With subtitle");
		await expect(panel.locator(`.wf-item[data-wf-item="${ITEM}t"] .wf-item-label`)).toHaveText(ITEM + "t");
		// a click on a row opens the item in the story
		await c.click();
		await expect(page.locator(`.tc-tiddler-frame[data-tiddler-title="${ITEM}c"]`)).toBeVisible();
	});

	test("counts do not change when tiddlers change", async ({ page }) => {
		await area(page, "alert", { caption: "Overdue", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await addTiddlers(page, [
			{ title: ITEM + "a1", tags: "WFTestAlert" },
			{ title: ITEM + "a2", tags: "WFTestAlert" },
		]);
		await check(page);
		await expect(chips(page)).toHaveCount(1);
		await expect(chips(page).first()).toContainText("2");
		await addTiddlers(page, [{ title: ITEM + "a2", tags: "" }]);
		await page.waitForTimeout(300);
		await expect(chips(page).first()).toContainText("2");
		await page.locator(".wf-dock-refresh").click();
		await expect(chips(page).first()).toContainText("1");
	});

	test("panel is not rendered while closed", async ({ page }) => {
		await area(page, "alert", { caption: "Overdue", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await addTiddlers(page, [{ title: ITEM + "a1", tags: "WFTestAlert" }]);
		await check(page);
		await expect(chips(page)).toHaveCount(1);
		await expect(page.locator(".wf-panel")).toHaveCount(0);
		await page.locator(".wf-dock-toggle").click();
		await expect(page.locator(".wf-panel")).toHaveCount(1);
		// Esc closes
		await page.keyboard.press("Escape");
		await expect(page.locator(".wf-panel")).toHaveCount(0);
		// click again closes; click outside closes
		await page.locator(".wf-dock-toggle").click();
		await expect(page.locator(".wf-panel")).toHaveCount(1);
		await page.locator(".wf-dock-toggle").click();
		await expect(page.locator(".wf-panel")).toHaveCount(0);
		await page.locator(".wf-dock-toggle").click();
		await page.mouse.click(700, 500);
		await expect(page.locator(".wf-panel")).toHaveCount(0);
	});

	test("click outside closes the panel and reaches what is underneath", async ({ page }) => {
		await area(page, "alert", { caption: "Overdue", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await addTiddlers(page, [{ title: ITEM + "a1", tags: "WFTestAlert" }]);
		// a plain page element away from the panel that records its clicks
		await page.evaluate(() => {
			const b = document.createElement("button");
			b.className = "wftest-btn";
			b.textContent = "Press";
			b.style.cssText = "position:fixed;right:300px;top:300px;z-index:10";
			b.addEventListener("click", () => { window.wftestClicked = true; });
			document.body.appendChild(b);
		});
		await check(page);
		await page.locator(".wf-dock-toggle").click();
		await expect(page.locator(".wf-panel")).toHaveCount(1);
		// clicks inside the panel keep it open
		await page.locator(".wf-panel .wf-panel-title").click();
		await expect(page.locator(".wf-panel")).toHaveCount(1);
		await page.locator(".wftest-btn").click();
		await expect(page.locator(".wf-panel")).toHaveCount(0);
		expect(await page.evaluate(() => window.wftestClicked)).toBe(true);
		// opening and closing never touches a synced tiddler
		expect(await page.evaluate(() => $tw.wiki.filterTiddlers("[prefix[$:/state/rimir/work-focus/]]"))).toEqual([]);
	});

	test("dock wraps instead of overflowing on a narrow viewport", async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 640 });
		const list = [];
		for (let i = 0; i < 14; i++) {
			list.push({ title: AREA + "n" + String(i).padStart(2, "0"), tags: "$:/tags/rimir/work-focus/area", caption: "A" + i, "wf.level": ["alert", "warning", "hint"][i % 3], "wf.filter": "[tag[WFTestAlert]]" });
			list.push({ title: ITEM + "x" + i, tags: "WFTestAlert" });
		}
		await addTiddlers(page, list);
		await page.evaluate(() => $tw.rootWidget.invokeActionString("<$action-wf-check/>"));
		await expect(chips(page)).toHaveCount(1);
		// first-match placement puts every item into the first area: give each area its own tag
		await page.evaluate(({ AREA, ITEM }) => {
			for (let i = 0; i < 14; i++) {
				const a = AREA + "n" + String(i).padStart(2, "0");
				$tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler(a), { "wf.filter": "[tag[WFTestN" + i + "]]" }));
				$tw.wiki.addTiddler({ title: ITEM + "x" + i, tags: "WFTestN" + i });
			}
			$tw.rootWidget.invokeActionString("<$action-wf-check/>");
		}, { AREA, ITEM });
		await expect(chips(page)).toHaveCount(14);
		const box = await dock(page).boundingBox();
		expect(box.x + box.width).toBeLessThanOrEqual(360);
		for (const c of await chips(page).all()) {
			const b = await c.boundingBox();
			expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width);
		}
		await page.screenshot({ path: (process.env.WF_SHOTS || require("os").tmpdir()) + "/dock-narrow.png", clip: { x: 0, y: 0, width: 360, height: 140 } });
	});

	test("tabs appear only with more than one tab", async ({ page }) => {
		await area(page, "a", { caption: "Overdue", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]", "wf.tab": "Tasks" });
		await area(page, "b", { caption: "Active", "wf.level": "hint", "wf.filter": "[tag[WFTestHint]]", "wf.tab": "Tasks" });
		await addTiddlers(page, [
			{ title: ITEM + "a1", tags: "WFTestAlert" },
			{ title: ITEM + "h1", tags: "WFTestHint" },
		]);
		await check(page);
		await page.locator(".wf-dock-toggle").click();
		await expect(page.locator(".wf-panel .wf-section")).toHaveCount(2);
		await expect(page.locator(".wf-panel .wf-tabs")).toHaveCount(0);
		await addTiddlers(page, [{ title: AREA + "b", tags: "$:/tags/rimir/work-focus/area", caption: "Active", "wf.level": "hint", "wf.filter": "[tag[WFTestHint]]", "wf.tab": "Plan" }]);
		await expect(page.locator(".wf-panel .wf-tab")).toHaveCount(2);
		await expect(page.locator(".wf-panel .wf-tab").nth(0)).toContainText("Tasks");
		await expect(page.locator(".wf-panel .wf-tab").nth(1)).toContainText("Plan");
		await expect(page.locator(".wf-panel .wf-section")).toHaveCount(1);
		await page.locator(".wf-panel .wf-tab").nth(1).click();
		await expect(page.locator(".wf-panel .wf-section .wf-section-head")).toContainText("Active");
		// areas with a blank wf.tab sit under a first unnamed tab
		await addTiddlers(page, [{ title: AREA + "c", tags: "$:/tags/rimir/work-focus/area", caption: "Loose", "wf.level": "warning", "wf.filter": "[tag[WFTestAlert]]" }]);
		await expect(page.locator(".wf-panel .wf-tab")).toHaveCount(3);
		await expect(page.locator(".wf-panel .wf-tab").nth(0)).toContainText("General");
	});

	test("long sections expand in place, acted rows and muted footer", async ({ page }) => {
		await area(page, "alert", { caption: "Overdue", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]sort[]]" });
		const items = [];
		for (let i = 1; i <= 8; i++) items.push({ title: ITEM + "n" + i, tags: "WFTestAlert" });
		await addTiddlers(page, items);
		const later = await page.evaluate(dayExpr(3));
		await page.evaluate(({ ITEM, later }) => {
			$tw.wiki.setTiddlerData("$:/rimir/work-focus/mutes", { [ITEM + "n8"]: later });
		}, { ITEM, later });
		await check(page);
		await page.evaluate(({ ITEM, AREA }) => {
			$tw.wiki.setTiddlerData("$:/temp/rimir/work-focus/acted", { [ITEM + "n1"]: { area: AREA + "alert", mark: "→ Fri" },
				[ITEM + "n8"]: { area: AREA + "alert", mark: "🔕 until Mon 9" } });
		}, { ITEM, AREA });
		await expect(chips(page).first()).toContainText("7");
		await page.locator(".wf-dock-toggle").click();
		const panel = page.locator(".wf-panel");
		// 6 open rows (n2..n7), limit 5 → 5 shown + "+ 1 more"; the acted row n1 shows its mark
		await expect(panel.locator(".wf-item:not(.wf-acted)")).toHaveCount(5);
		await expect(panel.locator(".wf-more")).toContainText("+ 1 more");
		const acted = panel.locator(`.wf-item.wf-acted[data-wf-item="${ITEM}n1"]`);
		await expect(acted).toContainText("→ Fri");
		await panel.locator(".wf-more").click();
		await expect(panel.locator(".wf-item:not(.wf-acted)")).toHaveCount(6);
		// muted footer → show → unmute
		await expect(panel.locator(".wf-foot")).toContainText("1 muted");
		await panel.locator(".wf-foot .wf-show-muted").click();
		await panel.locator(".wf-muted-item .wf-unmute").click();
		await expect(chips(page).first()).toContainText("8");
		const mutes = await page.evaluate(() => $tw.wiki.getTiddlerData("$:/rimir/work-focus/mutes", {}));
		expect(Object.keys(mutes)).toHaveLength(0);
		// unmute also drops the item's acted mark: the row is a plain row again, not struck through
		const actedNow = await page.evaluate(() => $tw.wiki.getTiddlerData("$:/temp/rimir/work-focus/acted", {}));
		expect(Object.keys(actedNow)).toEqual([ITEM + "n1"]);
		await expect(panel.locator(`.wf-item[data-wf-item="${ITEM}n8"]:not(.wf-acted)`)).toHaveCount(1);
	});

	test("dark palette derives readable level colours", async ({ page }) => {
		await area(page, "alert", { caption: "Overdue", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await addTiddlers(page, [{ title: ITEM + "a1", tags: "WFTestAlert" }]);
		await check(page);
		await page.evaluate(() => $tw.wiki.addTiddler({ title: "$:/palette", text: "$:/palettes/SpartanNight" }));
		await expect(page.locator(".wf-layer.wf-scheme-dark")).toHaveCount(1);
		await page.locator(".wf-dock-toggle").click();
		await expect(page.locator(".wf-section-head")).toHaveCount(1);
		// WCAG relative-luminance contrast of the section head against the panel surface
		const ratio = await page.evaluate(() => {
			function rgb(el, prop) {
				const c = document.createElement("canvas").getContext("2d");
				c.fillStyle = getComputedStyle(el)[prop];
				c.fillRect(0, 0, 1, 1);
				return Array.from(c.getImageData(0, 0, 1, 1).data).slice(0, 3);
			}
			function lum(v) { return v.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }).reduce((a, x, i) => a + x * [0.2126, 0.7152, 0.0722][i], 0); }
			const fg = lum(rgb(document.querySelector(".wf-section-head"), "color"));
			const bg = lum(rgb(document.querySelector(".wf-panel"), "backgroundColor"));
			return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
		});
		expect(ratio).toBeGreaterThan(4.5);
	});

	test("odd titles survive rows and navigation", async ({ page }) => {
		const odd = ITEM + 'A "quoted" [[odd]] title';
		await area(page, "alert", { caption: "Overdue", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await addTiddlers(page, [{ title: odd, tags: "WFTestAlert" }]);
		await check(page);
		await page.locator(".wf-dock-toggle").click();
		const row = page.locator(".wf-panel .wf-item");
		await expect(row).toHaveCount(1);
		expect(await row.getAttribute("data-wf-item")).toBe(odd);
		await expect(row.locator(".wf-item-label")).toHaveText(odd);
		await row.click();
		const story = await page.evaluate(() => $tw.wiki.getTiddlerList("$:/StoryList"));
		expect(story[0]).toBe(odd);
	});

	test("a broken area filter shows ! with the message", async ({ page }) => {
		await area(page, "bad", { caption: "Bad", "wf.level": "warning", "wf.filter": "[tag[unclosed" });
		await check(page);
		const chip = chips(page).first();
		await expect(chip).toContainText("!");
		await expect(chip).toHaveAttribute("title", /Filter error/);
	});
});

test.describe("work-focus ring", () => {
	const POSITION = "$:/config/rimir/work-focus/position";
	const ACTED = "$:/temp/rimir/work-focus/acted";
	const SHOTS = process.env.WF_SHOTS;

	test.beforeEach(async ({ page }) => {
		// a Friday: the day strip shows all five tiles (on Sun/Mon/Sat repeated days are dropped)
		await page.clock.setFixedTime(new Date(2026, 10, 6, 10, 0));
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto("/");
		await waitForTW(page);
		await sweep(page);
	});

	test.afterEach(async ({ page }) => {
		await page.mouse.up().catch(() => {});
		await sweep(page);
	});

	// One date area with one overdue item; panel open. Returns the item's row.
	async function fixture(page, title, position) {
		const yesterday = await page.evaluate(dayExpr(-1));
		if (position) await addTiddlers(page, [{ title: POSITION, text: position }]);
		await area(page, "alert", { caption: "Overdue", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]", "wf.date-field": "due", "wf.info": "date-relative" });
		await addTiddlers(page, [{ title, tags: "WFTestAlert", due: yesterday }]);
		await check(page);
		await page.locator(".wf-dock-toggle").click();
		const row = page.locator(".wf-panel .wf-item").first();
		await expect(row).toHaveAttribute("data-wf-item", title);
		return row;
	}

	async function centre(locator) {
		const b = await locator.boundingBox();
		return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
	}

	// Press on the row and move past the drag threshold
	async function drag(page, row) {
		const c = await centre(row);
		await page.mouse.move(c.x, c.y);
		await page.mouse.down();
		await page.mouse.move(c.x + 30, c.y, { steps: 4 });
	}

	async function hover(page, locator, ms) {
		const c = await centre(locator);
		await page.mouse.move(c.x, c.y, { steps: 6 });
		if (ms) await page.waitForTimeout(ms);
	}

	// Counts gesture listeners on document and window via the DevTools protocol
	async function listenerCounter(page) {
		const cdp = await page.context().newCDPSession(page);
		const TYPES = ["pointermove", "pointerup", "pointercancel", "keydown", "click", "touchmove", "contextmenu", "blur"];
		return async () => {
			let n = 0;
			for (const expression of ["document", "window"]) {
				const { result } = await cdp.send("Runtime.evaluate", { expression });
				const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
				n += listeners.filter((l) => TYPES.includes(l.type)).length;
			}
			return n;
		};
	}

	// n extra groups with one action each (the shipped groups give move, mute, open)
	async function extraGroups(page, n) {
		const list = [];
		for (let i = 1; i <= n; i++) {
			list.push({ title: CONF + "g" + i, tags: "$:/tags/rimir/work-focus/group", "wf.name": "wftest" + i, caption: "Extra " + i, "wf.icon": "★", "wf.order": String(60 + i) });
			list.push({ title: CONF + "a" + i, tags: "$:/tags/rimir/work-focus/action", caption: "Extra " + i, "wf.group": "wftest" + i, "wf.no-mark": "yes", text: `<$action-setfield $tiddler="${CONF}ran" text="${i}"/>` });
		}
		await addTiddlers(page, list);
	}

	// All tiles inside the viewport, no two overlapping, no inner tile over the panel
	async function expectClearLayout(page) {
		await page.waitForTimeout(250); // entry animations
		const r = await page.evaluate(() => {
			const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom, level: el.getAttribute("data-wf-level") }; };
			return {
				vw: document.documentElement.clientWidth,
				vh: document.documentElement.clientHeight,
				panel: box(document.querySelector(".wf-panel")),
				tiles: Array.from(document.querySelectorAll(".wf-ring .wf-tile")).map(box),
			};
		});
		const E = 0.5;
		const over = (a, b) => a.x < b.r - E && b.x < a.r - E && a.y < b.b - E && b.y < a.b - E;
		const problems = [];
		r.tiles.forEach((t, i) => {
			if (t.x < -E || t.y < -E || t.r > r.vw + E || t.b > r.vh + E) problems.push("viewport " + i);
			if (t.level === "0" && over(t, r.panel)) problems.push("panel " + i);
			r.tiles.forEach((u, j) => { if (j > i && over(t, u)) problems.push("overlap " + i + "/" + j); });
		});
		expect(problems).toEqual([]);
		return r;
	}

	const group = (page, name) => page.locator(`.wf-ring .wf-tile[data-wf-kind="group"][data-wf-group="${name}"]`);
	const day = (page, value) => page.locator(`.wf-ring .wf-tile[data-wf-kind="action"][data-wf-value="${value}"]`);

	test("dragging an item opens the ring on the panel edge", async ({ page }) => {
		const row = await fixture(page, ITEM + "a");
		await drag(page, row);
		const ring = page.locator(".wf-layer .wf-ring");
		await expect(ring).toBeVisible();
		const panel = await page.locator(".wf-panel").boundingBox();
		const box = await ring.boundingBox();
		expect(box.x).toBeGreaterThanOrEqual(panel.x + panel.width - 10);
		await expect(group(page, "move")).toBeVisible();
		await expect(page.locator(".wf-panel")).toHaveClass(/wf-dragging/);
		await expect(row).toHaveClass(/wf-src/);
		await expect(page.locator(".wf-ghost")).toHaveText(ITEM + "a");
	});

	test("hovering a group fans out its actions", async ({ page }) => {
		const row = await fixture(page, ITEM + "a");
		await drag(page, row);
		await expect(day(page, "+1d")).toHaveCount(0);
		await hover(page, group(page, "move"), 200);
		await expect(group(page, "move")).toHaveClass(/wf-hot/);
		await expect(day(page, "+1d")).toBeVisible();
		await expect(day(page, "today")).toBeVisible();
		await expect(page.locator(".wf-ring .wf-tile[data-wf-kind=action]")).toHaveCount(5);
		// a sibling group closes the fanned arc
		await hover(page, group(page, "mute"), 200);
		await expect(day(page, "+1d")).toHaveCount(0);
		await expect(page.locator(".wf-ring .wf-tile[data-wf-kind=action]")).toHaveCount(3);
	});

	test("releasing on a day moves the date and marks the item", async ({ page }) => {
		const title = ITEM + "a";
		const row = await fixture(page, title);
		const tomorrow = await page.evaluate(dayExpr(1));
		await drag(page, row);
		await hover(page, group(page, "move"), 200);
		await hover(page, day(page, "+1d"), 50);
		await expect(day(page, "+1d")).toHaveClass(/wf-hot/);
		await expect(page.locator(".wf-ring .wf-hint")).toContainText("due becomes");
		await page.mouse.up();
		await expect(page.locator(".wf-ring")).toHaveCount(0);
		expect(await page.evaluate((t) => $tw.wiki.getTiddler(t).fields.due, title)).toBe(tomorrow);
		const acted = page.locator(`.wf-panel .wf-item.wf-acted[data-wf-item="${title}"]`);
		await expect(acted).toContainText("→");
		await expect(acted.locator(".wf-item-label")).toHaveCSS("text-decoration-line", "line-through");
		const data = await page.evaluate((a) => $tw.wiki.getTiddlerData(a, {}), ACTED);
		expect(Object.keys(data)).toEqual([title]);
		// the click after the release neither closed the panel nor opened the item
		await expect(page.locator(".wf-panel")).toHaveCount(1);
		expect(await page.evaluate(() => $tw.wiki.getTiddlerList("$:/StoryList"))).not.toContain(title);
		// listeners are gone: moving around opens nothing
		await page.mouse.move(600, 300, { steps: 3 });
		await expect(page.locator(".wf-ring")).toHaveCount(0);
	});

	test("releasing on a group runs its default tile", async ({ page }) => {
		const title = ITEM + "a";
		const row = await fixture(page, title);
		const tomorrow = await page.evaluate(dayExpr(1));
		await drag(page, row);
		await hover(page, group(page, "move"), 50);
		await page.mouse.up();
		expect(await page.evaluate((t) => $tw.wiki.getTiddler(t).fields.due, title)).toBe(tomorrow);
	});

	test("Esc cancels without changes", async ({ page }) => {
		const title = ITEM + "a";
		const row = await fixture(page, title);
		const yesterday = await page.evaluate(dayExpr(-1));
		await drag(page, row);
		await hover(page, group(page, "move"), 200);
		await hover(page, day(page, "+1d"), 50);
		await page.keyboard.press("Escape");
		await expect(page.locator(".wf-ring")).toHaveCount(0);
		await page.mouse.up();
		expect(await page.evaluate((t) => $tw.wiki.getTiddler(t).fields.due, title)).toBe(yesterday);
		expect(await page.evaluate((a) => $tw.wiki.tiddlerExists(a), ACTED)).toBe(false);
		// Esc during a drag does not close the panel; the panel is no longer marked
		await expect(page.locator(".wf-panel")).toHaveCount(1);
		await expect(page.locator(".wf-panel")).not.toHaveClass(/wf-dragging/);
		await expect(page.locator(".wf-panel .wf-src")).toHaveCount(0);
	});

	test("a click still opens the item", async ({ page }) => {
		const title = ITEM + "a";
		const row = await fixture(page, title);
		await row.click();
		await expect(page.locator(`.tc-tiddler-frame[data-tiddler-title="${title}"]`)).toBeVisible();
		await expect(page.locator(".wf-ring")).toHaveCount(0);
	});

	test("ring stays inside the viewport at top-right", async ({ page }) => {
		const row = await fixture(page, ITEM + "a", "top-right");
		await expect(page.locator(".wf-layer.wf-pos-top-right")).toHaveCount(1);
		await drag(page, row);
		await expect(page.locator(".wf-ring")).toBeVisible();
		await hover(page, group(page, "move"), 200);
		await expect(day(page, "+1d")).toBeVisible();
		// the ring opens on the panel side facing the free space: left
		const panel = await page.locator(".wf-panel").boundingBox();
		const vp = page.viewportSize();
		const tiles = await page.locator(".wf-ring .wf-tile").all();
		expect(tiles.length).toBeGreaterThan(5);
		for (const t of tiles) {
			const b = await t.boundingBox();
			expect(b.x).toBeGreaterThanOrEqual(0);
			expect(b.y).toBeGreaterThanOrEqual(0);
			expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
			expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
			expect(b.x + b.width / 2).toBeLessThan(panel.x + 10);
		}
	});

	test("odd titles drag fine", async ({ page }) => {
		const title = ITEM + 'A "quoted" [[odd]] title';
		const row = await fixture(page, title);
		const tomorrow = await page.evaluate(dayExpr(1));
		await drag(page, row);
		await expect(page.locator(".wf-ghost")).toHaveText(title);
		await hover(page, group(page, "move"), 200);
		await hover(page, day(page, "+1d"), 50);
		await page.mouse.up();
		expect(await page.evaluate((t) => $tw.wiki.getTiddler(t).fields.due, title)).toBe(tomorrow);
		expect(Object.keys(await page.evaluate((a) => $tw.wiki.getTiddlerData(a, {}), ACTED))).toEqual([title]);
		await expect(page.locator(".wf-panel .wf-item.wf-acted")).toHaveAttribute("data-wf-item", title);
	});

	test("no listeners while idle", async ({ page }) => {
		const row = await fixture(page, ITEM + "a");
		const listeners = await listenerCounter(page);
		await page.evaluate(() => {
			const actions = $tw.modules.execute("$:/plugins/rimir/work-focus/actions.js");
			window.wfSelects = 0;
			const select = actions.select;
			window.wfRestore = () => { actions.select = select; };
			actions.select = function() { window.wfSelects++; return select.apply(this, arguments); };
		});
		try {
			const idle = await listeners();
			// hovering rows and the page without a press does nothing
			const c = await centre(row);
			await page.mouse.move(c.x, c.y, { steps: 5 });
			await page.mouse.move(c.x + 200, c.y + 40, { steps: 10 });
			await page.mouse.move(700, 500, { steps: 10 });
			await expect(page.locator(".wf-ring")).toHaveCount(0);
			expect(await page.evaluate(() => window.wfSelects)).toBe(0);
			expect(await listeners()).toBe(idle);
			// a press adds listeners, the drag selects once, the release removes them all
			await page.mouse.move(c.x, c.y);
			await page.mouse.down();
			expect(await listeners()).toBeGreaterThan(idle);
			await page.mouse.move(c.x + 30, c.y, { steps: 4 });
			await expect(page.locator(".wf-ring")).toBeVisible();
			await page.mouse.move(c.x + 60, c.y + 200, { steps: 4 });
			expect(await page.evaluate(() => window.wfSelects)).toBe(1);
			await page.mouse.up();
			await page.waitForTimeout(600);
			expect(await listeners()).toBe(idle);
		} finally {
			await page.evaluate(() => window.wfRestore());
		}
	});

	for (const position of ["bottom-left", "bottom-right"]) {
		test(`5 groups fit at ${position}`, async ({ page }) => {
			await extraGroups(page, 2);
			const row = await fixture(page, ITEM + "a", position);
			await expect(page.locator(`.wf-layer.wf-pos-${position}`)).toHaveCount(1);
			const rowBox = await row.boundingBox();
			expect(rowBox.y).toBeGreaterThan(600); // the panel stacks above the dock
			await drag(page, row);
			await expect(page.locator(".wf-ring .wf-tile[data-wf-level='0']")).toHaveCount(5);
			await expectClearLayout(page);
			await hover(page, group(page, "move"), 200);
			await expect(day(page, "+1d")).toBeVisible();
			const r = await expectClearLayout(page);
			expect(r.tiles.length).toBe(10);
			if (position === "bottom-left" && SHOTS) {
				await hover(page, day(page, "+1d"), 200);
				await page.screenshot({ path: require("path").join(SHOTS, "bottom-left-5-groups.png") });
			}
		});
	}

	test("6 groups fit mid-screen", async ({ page }) => {
		await extraGroups(page, 3);
		const yesterday = await page.evaluate(dayExpr(-1));
		// two areas: the dragged row sits in the second one, around the middle of the viewport
		await area(page, "a1", { caption: "First", "wf.level": "alert", "wf.filter": "[tag[WFTestA]sort[]]", "wf.date-field": "due" });
		await area(page, "a2", { caption: "Second", "wf.level": "warning", "wf.filter": "[tag[WFTestB]sort[]]", "wf.date-field": "due" });
		const list = [];
		for (let i = 1; i <= 3; i++) list.push({ title: ITEM + "a" + i, tags: "WFTestA", due: yesterday });
		for (let i = 1; i <= 4; i++) list.push({ title: ITEM + "b" + i, tags: "WFTestB", due: yesterday });
		await addTiddlers(page, list);
		await check(page);
		await page.locator(".wf-dock-toggle").click();
		await expect(page.locator(".wf-panel .wf-item")).toHaveCount(7);
		// the row nearest to the middle of the viewport
		const rows = await page.locator(".wf-panel .wf-item").all();
		let row = rows[0], best = Infinity;
		for (const r of rows) {
			const b = await r.boundingBox();
			if (Math.abs(b.y + b.height / 2 - 400) < best) { best = Math.abs(b.y + b.height / 2 - 400); row = r; }
		}
		const rowBox = await row.boundingBox();
		expect(Math.abs(rowBox.y + rowBox.height / 2 - 400)).toBeLessThan(150);
		await drag(page, row);
		await expect(page.locator(".wf-ring .wf-tile[data-wf-level='0']")).toHaveCount(6);
		await expectClearLayout(page);
		await hover(page, group(page, "move"), 200);
		await expect(day(page, "+1d")).toBeVisible();
		await expectClearLayout(page);
		await hover(page, group(page, "mute"), 200);
		await expect(page.locator(".wf-ring .wf-tile[data-wf-kind=action]")).toHaveCount(3);
		await expectClearLayout(page);
		// an extra group runs its single action
		await hover(page, group(page, "wftest3"), 50);
		await page.mouse.up();
		await expect.poll(() => page.evaluate((t) => $tw.wiki.getTiddlerText(t), CONF + "ran")).toBe("3");
	});

	test("losing the window mid-drag cancels the press", async ({ page }) => {
		const title = ITEM + "a";
		const row = await fixture(page, title);
		const yesterday = await page.evaluate(dayExpr(-1));
		const listeners = await listenerCounter(page);
		const idle = await listeners();
		await drag(page, row);
		await hover(page, group(page, "move"), 200);
		const target = await centre(day(page, "+1d"));
		expect(await listeners()).toBeGreaterThan(idle);
		await page.evaluate(() => window.dispatchEvent(new Event("blur")));
		await expect(page.locator(".wf-ring")).toHaveCount(0);
		await expect(page.locator(".wf-panel")).not.toHaveClass(/wf-dragging/);
		expect(await listeners()).toBe(idle);
		// the late release runs nothing
		await page.mouse.move(target.x, target.y, { steps: 3 });
		await page.mouse.up();
		expect(await page.evaluate((t) => $tw.wiki.getTiddler(t).fields.due, title)).toBe(yesterday);
		expect(await page.evaluate((a) => $tw.wiki.tiddlerExists(a), ACTED)).toBe(false);
	});

	test("releasing on empty space cancels and eats the click", async ({ page }) => {
		const title = ITEM + "a";
		const row = await fixture(page, title);
		const yesterday = await page.evaluate(dayExpr(-1));
		const story = await page.evaluate(() => $tw.wiki.getTiddlerList("$:/StoryList"));
		await page.evaluate(() => {
			window.wfClicks = 0;
			document.addEventListener("click", () => { window.wfClicks++; });
		});
		await drag(page, row);
		await expect(page.locator(".wf-ring")).toBeVisible();
		await page.mouse.move(1100, 600, { steps: 6 });
		await page.mouse.up();
		await expect(page.locator(".wf-ring")).toHaveCount(0);
		await page.waitForTimeout(100);
		expect(await page.evaluate(() => window.wfClicks)).toBe(0);
		await expect(page.locator(".wf-panel")).toHaveCount(1);
		expect(await page.evaluate((t) => $tw.wiki.getTiddler(t).fields.due, title)).toBe(yesterday);
		expect(await page.evaluate((a) => $tw.wiki.tiddlerExists(a), ACTED)).toBe(false);
		expect(await page.evaluate(() => $tw.wiki.getTiddlerList("$:/StoryList"))).toEqual(story);
		// the next real click is not eaten
		await page.waitForTimeout(450);
		await page.mouse.click(1100, 600);
		expect(await page.evaluate(() => window.wfClicks)).toBe(1);
	});

	test("ring screenshots", async ({ page }) => {
		test.skip(!SHOTS, "set WF_SHOTS to a directory to take ring screenshots");
		for (const position of ["top-left", "top-right"]) {
			for (const palette of ["$:/palettes/Vanilla", "$:/palettes/SpartanNight"]) {
				await addTiddlers(page, [{ title: "$:/palette", text: palette }]);
				const row = await fixture(page, ITEM + "Review offer draft", position);
				await addTiddlers(page, [
					{ title: ITEM + "Send bidder questions", tags: "WFTestAlert", due: await page.evaluate(dayExpr(-3)) },
					{ title: ITEM + "Write onboarding notes", tags: "WFTestAlert", due: await page.evaluate(dayExpr(-2)) },
				]);
				await check(page);
				await drag(page, row);
				await hover(page, group(page, "move"), 200);
				await hover(page, day(page, "+1d"), 200);
				const name = `${position}-${palette.endsWith("Night") ? "dark" : "light"}.png`;
				await page.screenshot({ path: require("path").join(SHOTS, name) });
				await page.keyboard.press("Escape");
				await page.mouse.up();
				await sweep(page);
				await page.goto("/");
				await waitForTW(page);
			}
		}
	});
});

test.describe("work-focus in a far-east timezone", () => {
	test.use({ timezoneId: "Pacific/Kiritimati" }); // UTC+14

	test("muted until shows the stored local day", async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		const r = await page.evaluate(({ AREA, ITEM }) => {
			const d = new Date(); d.setDate(d.getDate() + 3);
			const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
			const expected = "until " + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + " " + d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
			$tw.wiki.addTiddler(new $tw.Tiddler({ title: AREA + "tz", tags: "$:/tags/rimir/work-focus/area", "wf.level": "alert", "wf.filter": "[tag[WFTestTZ]]" }));
			$tw.wiki.addTiddler(new $tw.Tiddler({ title: ITEM + "tz", tags: "WFTestTZ" }));
			$tw.wiki.setTiddlerData("$:/rimir/work-focus/mutes", { [ITEM + "tz"]: ymd });
			$tw.rootWidget.invokeActionString("<$action-wf-check/>");
			$tw.wiki.addTiddler({ title: "$:/temp/rimir/work-focus/open", text: "yes" });
			$tw.wiki.addTiddler({ title: "$:/temp/rimir/work-focus/show-muted", text: "yes" });
			return expected;
		}, { AREA, ITEM });
		await expect(page.locator(".wf-muted-until")).toHaveText(r);
		await page.evaluate(({ AREA, ITEM, STATE }) => {
			$tw.wiki.filterTiddlers(`[prefix[${AREA}]] [prefix[${ITEM}]]`).forEach((t) => $tw.wiki.deleteTiddler(t));
			STATE.forEach((t) => $tw.wiki.deleteTiddler(t));
		}, { AREA, ITEM, STATE });
		await page.waitForFunction(() => !$tw.syncer || !$tw.syncer.isDirty(), null, { timeout: 5000 }).catch(() => {});
	});
});
