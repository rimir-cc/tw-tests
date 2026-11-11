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
	"$:/tags/rimir/work-focus/area",
	"$:/temp/rimir/work-focus/edit",
	"$:/temp/rimir/work-focus/edit-view",
	"$:/temp/rimir/work-focus/edit-area",
	"$:/temp/rimir/work-focus/confirm",
	"$:/temp/rimir/work-focus/tab-rename",
	"$:/temp/rimir/work-focus/info-add",
	"$:/temp/rimir/work-focus/form",
	"$:/temp/rimir/work-focus/form/buffer",
	"$:/temp/rimir/work-focus/form/tiles",
	"$:/temp/rimir/work-focus/form/tile-label",
	// overrides of shipped actions/groups written by the forms (synced; deleting one restores the shadow)
	"$:/plugins/rimir/work-focus/actions/open",
	"$:/plugins/rimir/work-focus/actions/day-strip",
	"$:/plugins/rimir/work-focus/actions/mute",
	"$:/plugins/rimir/work-focus/groups/open",
	"$:/plugins/rimir/work-focus/groups/move",
];
// areas created through edit mode ("+ area", "+ tab") are synced config tiddlers
const NEW_AREAS = "$:/config/rimir/work-focus/areas/";
// actions and groups saved by the forms
const NEW_ACTIONS = "$:/config/rimir/work-focus/actions/";
const NEW_GROUPS = "$:/config/rimir/work-focus/groups/";

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
	const created = await page.evaluate((ps) => $tw.wiki.filterTiddlers(ps.map((p) => `[prefix[${p}]]`).join(" ")), [NEW_AREAS, NEW_ACTIONS, NEW_GROUPS]);
	const left = await page.evaluate(({ AREA, ITEM, CONF, STATE, NEW_AREAS, NEW_ACTIONS, NEW_GROUPS }) => {
		const filter = `[prefix[${AREA}]] [prefix[${ITEM}]] [prefix[${CONF}]] [prefix[${NEW_AREAS}]] [prefix[${NEW_ACTIONS}]] [prefix[${NEW_GROUPS}]] [prefix[$:/temp/rimir/work-focus/more/]]`;
		$tw.wiki.filterTiddlers(filter).forEach((t) => $tw.wiki.deleteTiddler(t));
		STATE.forEach((t) => $tw.wiki.deleteTiddler(t));
		return $tw.wiki.filterTiddlers(filter).concat(STATE.filter((t) => $tw.wiki.tiddlerExists(t)));
	}, { AREA, ITEM, CONF, STATE, NEW_AREAS, NEW_ACTIONS, NEW_GROUPS });
	expect(left).toEqual([]);
	await page.waitForFunction(() => !$tw.syncer || !$tw.syncer.isDirty(), null, { timeout: 5000 }).catch(() => {});
	// a save still in flight from a page left by goto() can re-create a synced tiddler: delete on the server too
	for (const title of STATE.filter((t) => !t.startsWith("$:/temp/")).concat(created)) {
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
			$tw.wiki.setTiddlerData("$:/temp/rimir/work-focus/acted", { [AREA + "alert"]: { [ITEM + "n1"]: "→ Fri",
				[ITEM + "n8"]: "🔕 until Mon 9" } });
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
		expect(actedNow).toEqual({ [AREA + "alert"]: { [ITEM + "n1"]: "→ Fri" } });
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
		const TYPES = ["pointermove", "pointerup", "pointercancel", "pointerdown", "keydown", "click", "touchmove", "contextmenu", "blur"];
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
		await expect(page.locator(".wf-ring .wf-tile[data-wf-kind=action]")).toHaveCount(6);
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
		expect(data).toEqual({ [AREA + "alert"]: { [title]: expect.stringContaining("→") } });
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
		expect(Object.keys((await page.evaluate((a) => $tw.wiki.getTiddlerData(a, {}), ACTED))[AREA + "alert"])).toEqual([title]);
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
			expect(r.tiles.length).toBe(11);
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

	test.describe("in edit mode", () => {
		const FORM = "$:/temp/rimir/work-focus/form";
		const BUFFER = "$:/temp/rimir/work-focus/form/buffer";
		const S = "$:/plugins/rimir/work-focus/";
		const ring = (page) => page.locator(".wf-layer .wf-ring");
		const form = (page) => page.locator(".wf-form");
		const tiles = (page, level) => page.locator(`.wf-ring .wf-tile[data-wf-level="${level}"]`);

		// The fixture's panel switched to edit mode, Actions view (the item rows). Returns the row.
		async function editFixture(page, title, position) {
			await fixture(page, title, position);
			await page.locator(".wf-panel .wf-edit-toggle").click();
			await page.locator('.wf-panel .wf-edit-view[data-wf-view="actions"]').click();
			const row = page.locator(".wf-panel .wf-item").first();
			await expect(row).toHaveAttribute("data-wf-item", title);
			return row;
		}

		// Drag the row and release: the ring stays, pinned
		async function pin(page, row) {
			await drag(page, row);
			await expect(ring(page)).toBeVisible();
			await page.mouse.up();
			await expect(page.locator(".wf-ring.wf-pinned")).toBeVisible();
		}

		test("in edit mode the ring stays open after release", async ({ page }) => {
			const title = ITEM + "a";
			const row = await editFixture(page, title);
			const yesterday = await page.evaluate(dayExpr(-1));
			await drag(page, row);
			await hover(page, group(page, "move"), 200);
			await expect(day(page, "+1d")).toBeVisible();
			await hover(page, day(page, "+1d"), 50);
			await page.mouse.up();
			// released on a day: nothing ran, the ring is pinned with the arc still open
			await expect(page.locator(".wf-ring.wf-pinned")).toBeVisible();
			await page.waitForTimeout(300);
			await expect(ring(page)).toHaveCount(1);
			expect(await page.evaluate((t) => $tw.wiki.getTiddler(t).fields.due, title)).toBe(yesterday);
			expect(await page.evaluate((a) => $tw.wiki.tiddlerExists(a), ACTED)).toBe(false);
			await expect(day(page, "+1d")).toBeVisible();
			// the click after the release was eaten: panel open, item not opened
			await expect(page.locator(".wf-panel")).toHaveCount(1);
			expect(await page.evaluate(() => $tw.wiki.getTiddlerList("$:/StoryList"))).not.toContain(title);
			// every group and action has ✎; "+ group" ends the inner ring, "+ add…" ends Move's arc
			const groups = page.locator('.wf-ring .wf-tile[data-wf-kind="group"]');
			expect(await groups.count()).toBeGreaterThan(2);
			await expect(page.locator('.wf-ring .wf-tile[data-wf-kind="group"]:not(.wf-tile-edit)')).toHaveCount(0);
			await expect(page.locator('.wf-ring .wf-tile[data-wf-kind="action"]:not(.wf-tile-edit)')).toHaveCount(0);
			await expect(page.locator(".wf-ring .wf-tile-edit .wf-tile-badge").first()).toHaveText("✎");
			await expect(page.locator('.wf-ring .wf-tile-add[data-wf-add="group"]')).toHaveCount(1);
			await expect(page.locator('.wf-ring .wf-tile-add[data-wf-add="group"]')).toHaveAttribute("data-wf-level", "0");
			await expect(page.locator('.wf-ring .wf-tile-add[data-wf-add="in"][data-wf-group="move"]')).toHaveCount(1);
			// no grabbing cursor while pinned
			expect(await page.evaluate(() => document.documentElement.classList.contains("wf-grabbing"))).toBe(false);
			await expectClearLayout(page);
		});

		test("clicking a tile opens its form beside the ring", async ({ page }) => {
			const row = await editFixture(page, ITEM + "a");
			await pin(page, row);
			// a click opens a group's arc at once (no hover delay needed)
			await group(page, "open").click();
			const open = page.locator(`.wf-ring .wf-tile[data-wf-kind="action"][data-wf-action="${S}actions/open"]`);
			await expect(open).toBeVisible();
			await open.click();
			await expect(form(page)).toBeVisible();
			// placed next to the ring (inline left/top), not at the window edge
			await expect(form(page)).toHaveClass(/wf-placed/);
			await expect(form(page)).not.toHaveClass(/wf-side-/);
			await expect(form(page).locator(".wf-f-caption")).toHaveValue(await open.locator(".wf-tile-caption").textContent());
			await expect(open).toHaveClass(/wf-tile-editing/);
			expect(await page.evaluate((f) => $tw.wiki.getTiddler(f).fields.item, FORM)).toBe(ITEM + "a");
			// on the free side of the ring: right of the panel and of the inner ring
			const panel = await page.locator(".wf-panel").boundingBox();
			const box = await form(page).boundingBox();
			expect(box.x).toBeGreaterThan(panel.x + panel.width);
			// ✎ on a group opens the group form; the ring stays
			await group(page, "move").locator(".wf-tile-badge").click();
			await expect(form(page).locator(".wf-form-title")).toContainText('Group "Move"');
			await expect(form(page).locator(".wf-f-caption")).toHaveValue(await group(page, "move").locator(".wf-tile-caption").textContent());
			await expect(group(page, "move")).toHaveClass(/wf-tile-editing/);
			await expect(open).not.toHaveClass(/wf-tile-editing/);
			await expect(ring(page)).toHaveCount(1);
			// the form closes: the mark goes
			await form(page).locator(".wf-form-close").click();
			await expect(form(page)).toHaveCount(0);
			await expect(page.locator(".wf-ring .wf-tile-editing")).toHaveCount(0);
			await expect(ring(page)).toHaveCount(1);
		});

		test("the form sits on the left when the ring opens to the left", async ({ page }) => {
			const row = await editFixture(page, ITEM + "a", "top-right");
			await pin(page, row);
			await group(page, "move").locator(".wf-tile-badge").click();
			await expect(form(page)).toHaveClass(/wf-placed/);
			const panel = await page.locator(".wf-panel").boundingBox();
			const box = await form(page).boundingBox();
			expect(box.x + box.width).toBeLessThan(panel.x);
			// left of the ring's tiles, inside the viewport
			const left = await page.evaluate(() => Math.min(...Array.from(document.querySelectorAll(".wf-ring .wf-tile")).map((n) => n.getBoundingClientRect().left)));
			expect(box.x + box.width).toBeLessThan(left);
			expect(box.x).toBeGreaterThanOrEqual(16);
		});

		test("form opens next to the ring", async ({ page }) => {
			const row = await editFixture(page, ITEM + "a");
			await pin(page, row);
			await group(page, "move").click();
			await expect(day(page, "+1d")).toBeVisible();
			await page.waitForTimeout(250); // entry animations
			const outer = await page.evaluate(() => Math.max(...Array.from(document.querySelectorAll(".wf-ring .wf-tile")).map((n) => n.getBoundingClientRect().right)));
			const tile = await day(page, "+1d").boundingBox();
			await day(page, "+1d").click();
			await expect(form(page)).toHaveClass(/wf-placed/);
			await page.waitForTimeout(200); // entry animation
			// opened from a tile: typing must not rename the whole action (the Label input is not focused)
			await expect(form(page).locator(".wf-f-caption")).not.toBeFocused();
			const box = await form(page).boundingBox();
			// just outside the outer arc, level with the tile, inside the viewport, away from the window edge
			expect(box.x - outer).toBeGreaterThan(0);
			expect(box.x - outer).toBeLessThanOrEqual(40);
			expect(Math.abs(box.y - (tile.y + tile.height / 2 - 40))).toBeLessThan(1);
			expect(box.y).toBeGreaterThanOrEqual(16);
			expect(box.y + box.height).toBeLessThanOrEqual(800 - 16 + 0.5);
			expect(box.x + box.width).toBeLessThan(1280 - 16 - 20);
			// opening another arc does not move it
			await group(page, "mute").click();
			await expect(page.locator('.wf-ring .wf-tile[data-wf-kind="action"][data-wf-level="1"]').first()).toBeVisible();
			expect(await form(page).boundingBox()).toEqual(box);
			expect(await page.evaluate((f) => [$tw.wiki.getTiddler(f).fields.left, $tw.wiki.getTiddler(f).fields.top], FORM)).toEqual([String(Math.round(box.x)), String(Math.round(box.y))]);
			// a narrow window: no room beside the ring, the form goes to the window edge
			await form(page).locator(".wf-form-close").click();
			await page.keyboard.press("Escape");
			await expect(ring(page)).toHaveCount(0);
			await page.setViewportSize({ width: 900, height: 800 });
			await pin(page, page.locator(".wf-panel .wf-item").first());
			await group(page, "move").click();
			await day(page, "+1d").click();
			await expect(form(page)).toHaveClass(/wf-side-right/);
			await expect(form(page)).not.toHaveClass(/wf-placed/);
		});

		test("tiles editor shows the day strip", async ({ page }) => {
			const row = await editFixture(page, ITEM + "a");
			await pin(page, row);
			await group(page, "move").click();
			await day(page, "+1d").click();
			const chips = form(page).locator(".wf-tchip");
			await expect(chips).toHaveCount(6);
			await expect(chips.locator(".wf-tchip-value")).toHaveText(["today", "+1d", "+2d", "+3d", "+4d", "+1w"]);
			// labelled as in the ring (Fri 6 Nov 2026): the template, with the date as sub line
			await expect(chips.locator(".wf-tchip-name")).toHaveText(["Today", "Tmrw", "Sun", "Mon", "Tue", "+1 wk"]);
			await expect(chips.locator(".wf-tchip-sub")).toHaveText(["06 Nov", "07 Nov", "08 Nov", "09 Nov", "10 Nov", "13 Nov"]);
			await expect(form(page).locator(".wf-tchip.wf-on")).toHaveCount(1);
			await expect(form(page).locator(".wf-tchip.wf-on")).toHaveAttribute("data-wf-value", "+1d");
			await expect(form(page).locator(".wf-tiles-count")).toHaveText("This action makes 6 tiles");
			// rename is discoverable without hovering: a ✎ after every name and a hint
			await expect(form(page).locator(".wf-tiles-tip")).toHaveText("✎ click a name to rename it");
			await expect(chips.locator(".wf-tchip-pen")).toHaveCount(6);
			await page.mouse.move(5, 795);
			await expect(chips.first().locator(".wf-tchip-pen")).toBeVisible();
			expect(await chips.first().locator(".wf-tchip-pen").evaluate((n) => { const c = getComputedStyle(n); return Number(c.opacity) > 0.9 && c.visibility === "visible" && c.color !== "rgba(0, 0, 0, 0)"; })).toBe(true);
			await expect(form(page).locator(".wf-form-title")).toHaveText('✎ Move date · tile "Tmrw" (+1d)');
			await expect(form(page).locator(".wf-form-sub")).toHaveText("All Move tiles belong to this one action.");
			// first and last can't move further out
			await expect(chips.first().locator(".wf-tchip-left")).toBeDisabled();
			await expect(chips.last().locator(".wf-tchip-right")).toBeDisabled();
			// the raw filter lives under Advanced
			await expect(form(page).locator(".wf-f-advanced summary")).toHaveText("Advanced: tiles filter and templates");
			// the clicked value removed: the header no longer names it
			await form(page).locator('.wf-tchip[data-wf-value="+1d"] .wf-tchip-x').click();
			await expect(form(page).locator(".wf-form-title")).toHaveText('✎ Action "Move date"');
			await expect(form(page).locator(".wf-tchip.wf-on")).toHaveCount(0);
			// the group name in the header opens the group form in the same place
			const placed = await form(page).boundingBox();
			await form(page).locator(".wf-form-sub .wf-form-group-link").click();
			await expect(form(page).locator(".wf-form-title")).toHaveText('✎ Group "Move"');
			await expect(form(page)).toHaveClass(/wf-placed/);
			expect((await form(page).boundingBox()).x).toBe(placed.x);
			// an action without tiles: one tile, and a way to make several
			await group(page, "open").click();
			await page.locator(`.wf-ring .wf-tile[data-wf-kind="action"][data-wf-action="${S}actions/open"]`).click();
			await expect(form(page).locator(".wf-tiles-one")).toContainText("One tile (label = the action's label)");
			await expect(form(page).locator(".wf-tiles-start")).toHaveText("Add the first tile");
			await expect(form(page).locator(".wf-form-sub")).toHaveCount(0);
			await form(page).locator(".wf-tiles-start").click();
			await expect(form(page).locator(".wf-tchip")).toHaveCount(0);
			await expect(form(page).locator(".wf-tiles-add-in")).toBeVisible();
			// never "makes 0 tiles"
			await expect(form(page).locator(".wf-tiles-count")).toHaveCount(0);
			await expect(form(page).locator(".wf-tiles-one-text")).toHaveText("One tile (label = the action's label)");
		});

		test("tiles editor adds, removes, reorders and relabels", async ({ page }) => {
			const row = await editFixture(page, ITEM + "a");
			await pin(page, row);
			await group(page, "move").click();
			await day(page, "+1d").click();
			const chip = (v) => form(page).locator(`.wf-tchip[data-wf-value="${v}"]`);
			const values = form(page).locator(".wf-tchip .wf-tchip-value");
			// add from the list (values already there are not offered)
			await expect(form(page).locator('.wf-tiles-pick option[value="+2d"]')).toHaveCount(0);
			await form(page).locator(".wf-tiles-pick").selectOption("+5d");
			await expect(values).toHaveText(["today", "+1d", "+2d", "+3d", "+4d", "+1w", "+5d"]);
			await expect(form(page).locator(".wf-tiles-pick")).toHaveValue("");
			// add by typing: Enter adds and the input keeps the focus
			const free = form(page).locator(".wf-tiles-add-in");
			await free.fill("+10d");
			await free.press("Enter");
			await expect(values).toHaveText(["today", "+1d", "+2d", "+3d", "+4d", "+1w", "+5d", "+10d"]);
			await expect(free).toBeFocused();
			await expect(free).toHaveValue("");
			await chip("+10d").locator(".wf-tchip-x").click();
			// remove, move left
			await chip("+4d").locator(".wf-tchip-x").click();
			await chip("+1w").locator(".wf-tchip-left").click();
			await expect(values).toHaveText(["today", "+1d", "+2d", "+1w", "+3d", "+5d"]);
			// relabel: typing keeps the focus and updates label and header; Esc undoes
			await chip("+3d").locator(".wf-tchip-label").click();
			await chip("+3d").locator(".wf-tchip-in").fill("Monday");
			await chip("+3d").locator(".wf-tchip-in").press("Escape");
			await expect(form(page)).toBeVisible();
			await expect(chip("+3d").locator(".wf-tchip-name")).toHaveText("Mon");
			await chip("+1d").locator(".wf-tchip-label").click();
			const input = chip("+1d").locator(".wf-tchip-in");
			await expect(input).toBeFocused();
			await expect(input).toHaveAttribute("placeholder", "Tmrw");
			await input.pressSequentially("Tomorrow");
			await expect(input).toBeFocused();
			await expect(form(page).locator(".wf-form-title")).toHaveText('✎ Move date · tile "Tomorrow" (+1d)');
			await input.press("Enter");
			await expect(chip("+1d").locator(".wf-tchip-name")).toHaveText("Tomorrow");
			// nothing written before Save
			expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), S + "actions/day-strip")).toBe(false);
			await form(page).locator(".wf-form-save").click();
			await expect(form(page)).toHaveCount(0);
			// the ring rebuilt with the new order and label (Move's arc still open)
			const arc = page.locator('.wf-ring .wf-tile[data-wf-kind="action"][data-wf-level="1"]');
			await expect(arc).toHaveCount(6);
			expect(await arc.evaluateAll((ns) => ns.map((n) => n.getAttribute("data-wf-value")))).toEqual(["today", "+1d", "+2d", "+1w", "+3d", "+5d"]);
			await expect(arc.locator(".wf-tile-caption")).toHaveText(["Today", "Tomorrow", "Sun", "+1 wk", "Mon", "Wed"]);
			const saved = await page.evaluate((t) => $tw.wiki.getTiddler(t).fields, S + "actions/day-strip");
			expect(saved["wf.tiles"]).toBe("[[today]] [[+1d]] [[+2d]] [[+1w]] [[+3d]] [[+5d]]");
			expect(JSON.parse(saved["wf.tile-labels"])).toEqual({ "+1d": "Tomorrow" });
		});

		test("saving rebuilds the ring with the same arcs open", async ({ page }) => {
			const row = await editFixture(page, ITEM + "a");
			await pin(page, row);
			await group(page, "move").click();
			await expect(day(page, "+1d")).toBeVisible();
			const before = await page.locator(".wf-ring .wf-tile").count();
			await expect(day(page, "+1d")).toHaveAttribute("title", "Tmrw · Move date");
			await day(page, "+1d").click();
			await expect(form(page).locator(".wf-f-caption")).toHaveValue("Move date");
			await form(page).locator(".wf-f-caption").fill("Shift date");
			await form(page).locator(".wf-form-save").click();
			await expect(form(page)).toHaveCount(0);
			// rebuilt: the change shows, Move's arc is still open, nothing doubled
			await expect(day(page, "+1d")).toHaveAttribute("title", "Tmrw · Shift date");
			await expect(group(page, "move")).toHaveClass(/wf-open/);
			await expect(page.locator(".wf-ring .wf-tile")).toHaveCount(before);
			await expect(page.locator('.wf-ring .wf-tile[data-wf-kind="action"][data-wf-level="1"]')).toHaveCount(6);
			await expect(ring(page)).toHaveCount(1);
			await expect(page.locator(".wf-ring .wf-ring-guide")).toHaveCount(2);
			await expect(page.locator(".wf-ring.wf-pinned")).toHaveCount(1);
			// deleting the override restores the shipped action: rebuilt again
			await page.evaluate((t) => $tw.wiki.deleteTiddler(t), S + "actions/day-strip");
			await expect(day(page, "+1d")).toHaveAttribute("title", "Tmrw · Move date");
			await expect(page.locator(".wf-ring .wf-tile")).toHaveCount(before);
			// form state and buffer changes do not rebuild (the tile elements stay the same)
			await page.evaluate(() => { document.querySelector('.wf-ring .wf-tile[data-wf-value="+1d"]').wfMark = 1; });
			await page.evaluate((b) => $tw.wiki.addTiddler({ title: b, text: "x" }), BUFFER);
			await page.waitForTimeout(100);
			expect(await page.evaluate(() => document.querySelector('.wf-ring .wf-tile[data-wf-value="+1d"]').wfMark)).toBe(1);
		});

		test("plus tiles create a group and an action in a group", async ({ page }) => {
			const row = await editFixture(page, ITEM + "a");
			await pin(page, row);
			await page.locator('.wf-ring .wf-tile-add[data-wf-add="group"]').click();
			await expect(form(page).locator(".wf-form-title")).toHaveText("✎ New group");
			await form(page).locator(".wf-f-caption").fill("WF Test Group");
			await form(page).locator(".wf-form-save").click();
			await expect(form(page)).toHaveCount(0);
			// the new (empty) group shows in the inner ring, before "+ group"
			const g = group(page, "wf-test-group");
			await expect(g).toHaveAttribute("data-wf-level", "0");
			await expect(g.locator(".wf-tile-caption")).toHaveText("WF Test Group");
			await g.click();
			const add = page.locator('.wf-ring .wf-tile-add[data-wf-add="in"][data-wf-group="wf-test-group"]');
			await expect(add).toBeVisible();
			await expect(tiles(page, 1)).toHaveCount(1);
			// "+ add…" opens its menu; a press outside the menu closes it
			await add.click();
			const menu = page.locator(".wf-ring .wf-add-menu");
			await expect(menu.locator(".wf-add-menu-item")).toHaveText(["＋ action in WF Test Group", "＋ sub-group in WF Test Group"]);
			await page.locator(".wf-panel .wf-panel-head").click();
			await expect(menu).toHaveCount(0);
			await expect(ring(page)).toHaveCount(1);
			await add.click();
			await menu.locator('.wf-add-menu-item[data-wf-add-kind="action"]').click();
			await expect(menu).toHaveCount(0);
			await expect(form(page).locator(".wf-form-title")).toHaveText("✎ New action");
			expect(await page.evaluate((b) => $tw.wiki.getTiddler(b).fields["wf.group"], BUFFER)).toBe("wf-test-group");
			await form(page).locator(".wf-f-caption").fill("WF Test Action");
			await form(page).locator(".wf-form-save").click();
			await expect(form(page)).toHaveCount(0);
			// the new action shows in the open arc of its group
			await expect(g).toHaveClass(/wf-open/);
			const action = page.locator('.wf-ring .wf-tile[data-wf-kind="action"][data-wf-level="1"]');
			await expect(action).toHaveCount(1);
			await expect(action.locator(".wf-tile-caption")).toHaveText("WF Test Action");
			// a sub-group of it through the menu gets wf.parent
			await add.click();
			await menu.locator('.wf-add-menu-item[data-wf-add-kind="group"]').click();
			expect(await page.evaluate((b) => $tw.wiki.getTiddler(b).fields["wf.parent"], BUFFER)).toBe("wf-test-group");
			await page.keyboard.press("Escape");
			await expect(form(page)).toHaveCount(0);
			await expect(ring(page)).toHaveCount(1);
		});

		test("hidden actions show dimmed in edit mode and not outside it", async ({ page }) => {
			await addTiddlers(page, [
				{ title: CONF + "hidden", tags: "$:/tags/rimir/work-focus/action", caption: "WF Hidden", "wf.group": "open", "wf.hidden": "yes", text: `<$action-setfield $tiddler="${CONF}ran" text="x"/>` },
				{ title: CONF + "hgroup", tags: "$:/tags/rimir/work-focus/group", "wf.name": "wfhidden", caption: "WF Hidden group", "wf.hidden": "yes", "wf.order": "45" },
				{ title: CONF + "hidden2", tags: "$:/tags/rimir/work-focus/action", caption: "WF In hidden", "wf.group": "wfhidden", text: `<$action-setfield $tiddler="${CONF}ran" text="y"/>` },
			]);
			const hiddenTile = (page) => page.locator(`.wf-ring .wf-tile[data-wf-action="${CONF}hidden"]`);
			// outside edit mode: neither the hidden action nor the hidden group
			let row = await fixture(page, ITEM + "a");
			await drag(page, row);
			await expect(group(page, "move")).toBeVisible();
			await expect(group(page, "wfhidden")).toHaveCount(0);
			await hover(page, group(page, "open"), 200);
			await expect(hiddenTile(page)).toHaveCount(0);
			await expect(page.locator(".wf-ring .wf-tile-edit, .wf-ring .wf-tile-add, .wf-ring .wf-tile-hidden")).toHaveCount(0);
			await page.keyboard.press("Escape");
			await page.mouse.up();
			// in edit mode: both, dimmed, with "hidden" as the sub line
			await page.locator(".wf-panel .wf-edit-toggle").click();
			await page.locator('.wf-panel .wf-edit-view[data-wf-view="actions"]').click();
			row = page.locator(".wf-panel .wf-item").first();
			await pin(page, row);
			await expect(group(page, "wfhidden")).toHaveClass(/wf-tile-hidden/);
			await expect(group(page, "wfhidden").locator(".wf-tile-sub")).toHaveText("hidden");
			await expect(group(page, "move")).not.toHaveClass(/wf-tile-hidden/);
			await group(page, "open").click();
			await expect(hiddenTile(page)).toHaveClass(/wf-tile-hidden/);
			await expect(hiddenTile(page).locator(".wf-tile-sub")).toHaveText("hidden");
			expect(Number(await hiddenTile(page).evaluate((n) => getComputedStyle(n).opacity))).toBeLessThan(0.8);
			expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), CONF + "ran")).toBe(false);
		});

		test("pinned ring closes cleanly", async ({ page }) => {
			const row = await editFixture(page, ITEM + "a");
			const listeners = await listenerCounter(page);
			const idle = await listeners();
			const closed = async () => {
				await expect(ring(page)).toHaveCount(0);
				await expect(page.locator(".wf-panel.wf-dragging, .wf-panel .wf-src")).toHaveCount(0);
				await page.waitForTimeout(500);
				expect(await listeners()).toBe(idle);
			};
			const freshRow = () => page.locator(".wf-panel .wf-item").first();
			// pinned: only the two close listeners (keydown, pointerdown) once the eaten click is gone
			await pin(page, row);
			await page.waitForTimeout(500);
			expect(await listeners()).toBe(idle + 2);
			// Esc closes it; edit mode and panel stay
			await page.keyboard.press("Escape");
			await closed();
			await expect(page.locator(".wf-panel.wf-editing")).toHaveCount(1);
			// with a form open, Esc closes the form first, then the ring
			await pin(page, freshRow());
			await group(page, "move").locator(".wf-tile-badge").click();
			await expect(form(page)).toBeVisible();
			await page.keyboard.press("Escape");
			await expect(form(page)).toHaveCount(0);
			await expect(ring(page)).toHaveCount(1);
			// also when a click on the ring took the focus out of the form
			await group(page, "move").locator(".wf-tile-badge").click();
			await group(page, "mute").click();
			expect(await page.evaluate(() => !!document.activeElement.closest(".wf-keys"))).toBe(false);
			await page.keyboard.press("Escape");
			await expect(form(page)).toHaveCount(0);
			await expect(ring(page)).toHaveCount(1);
			await page.keyboard.press("Escape");
			await closed();
			// switching to the Areas view (inside the panel) closes it: its source rows are gone
			await pin(page, freshRow());
			await page.locator('.wf-panel .wf-edit-view[data-wf-view="areas"]').click();
			await closed();
			await page.locator('.wf-panel .wf-edit-view[data-wf-view="actions"]').click();
			// a press outside ring, form and panel closes it
			await pin(page, freshRow());
			await page.mouse.click(1200, 760);
			await closed();
			// closing the panel closes it
			if (await page.locator(".wf-panel").count() === 0) await page.locator(".wf-dock-toggle").click();
			await pin(page, freshRow());
			await page.locator(".wf-dock-toggle").click();
			await expect(page.locator(".wf-panel")).toHaveCount(0);
			await closed();
			// leaving edit mode closes it
			await page.locator(".wf-dock-toggle").click();
			await pin(page, freshRow());
			await page.locator(".wf-panel .wf-edit-done").click();
			await closed();
			await expect(page.locator(".wf-panel.wf-editing")).toHaveCount(0);
			// pressing another row while pinned closes it first (a plain click opens the item)
			await page.locator(".wf-panel .wf-edit-toggle").click();
			await page.locator('.wf-panel .wf-edit-view[data-wf-view="actions"]').click();
			await pin(page, freshRow());
			await freshRow().click();
			await closed();
		});

		test("ring edit screenshots", async ({ page }) => {
			test.skip(!SHOTS, "set WF_SHOTS to a directory to take ring screenshots");
			const path = require("path");
			for (const palette of ["$:/palettes/Vanilla", "$:/palettes/SpartanNight"]) {
				const mode = palette.endsWith("Night") ? "dark" : "light";
				await addTiddlers(page, [{ title: "$:/palette", text: palette }]);
				const row = await editFixture(page, ITEM + "Review offer draft");
				await pin(page, row);
				await group(page, "move").click();
				await page.locator('.wf-ring .wf-tile-add[data-wf-add="in"][data-wf-group="move"]').click();
				await page.mouse.move(1200, 780);
				await page.waitForTimeout(250);
				await page.screenshot({ path: path.join(SHOTS, `ring-edit-menu-${mode}.png`) });
				await day(page, "+3d").click();
				await page.mouse.move(1200, 780);
				await page.waitForTimeout(500);
				await page.screenshot({ path: path.join(SHOTS, `ring-edit-form-${mode}.png`) });
				await page.keyboard.press("Escape");
				await page.keyboard.press("Escape");
				await sweep(page);
				await page.goto("/");
				await waitForTW(page);
			}
		});
	});
});

test.describe("work-focus edit mode", () => {
	const SHOTS = process.env.WF_SHOTS;
	const EDIT_AREA = "$:/temp/rimir/work-focus/edit-area";
	const AREA_TAG = "$:/tags/rimir/work-focus/area";

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

	const card = (page, title) => page.locator(`.wf-panel .wf-area-card[data-wf-area-card="${title}"]`);
	const field = (page, title, name) => page.evaluate(({ title, name }) => { const t = $tw.wiki.getTiddler(title); return t ? t.fields[name] : undefined; }, { title, name });
	const tagList = (page) => page.evaluate((t) => $tw.wiki.getTiddlerList(t), AREA_TAG);

	// Panel open in edit mode (Areas view)
	async function openEdit(page) {
		await page.locator(".wf-dock-toggle").click();
		await page.locator(".wf-panel .wf-edit-toggle").click();
		await expect(page.locator(".wf-panel.wf-editing")).toHaveCount(1);
	}

	async function openCard(page, title) {
		await card(page, title).locator(".wf-card-head").click();
		await expect(card(page, title).locator(".wf-f-caption")).toBeVisible();
	}

	test("pencil toggles edit mode, Esc leaves it before closing the panel", async ({ page }) => {
		await area(page, "a", { caption: "Alpha", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await addTiddlers(page, [{ title: ITEM + "a1", tags: "WFTestAlert" }]);
		await check(page);
		await openEdit(page);
		const panel = page.locator(".wf-panel");
		await expect(panel.locator(".wf-edit-badge")).toHaveText("✎ editing setup");
		await expect(panel.locator(".wf-edit-done")).toHaveText("Done editing");
		await expect(panel.locator('.wf-edit-view[data-wf-view="areas"]')).toHaveClass(/wf-on/);
		// one tab only, still shown in edit mode, with ✎ and "+ tab"
		await expect(panel.locator(".wf-tab")).toHaveCount(1);
		await expect(panel.locator(".wf-tab .wf-tab-rename")).toHaveCount(1);
		await expect(panel.locator(".wf-tab-add")).toHaveText("+ tab");
		await expect(card(page, AREA + "a")).toBeVisible();
		await expect(card(page, AREA + "a").locator(".wf-grip")).toHaveText("⋮⋮");
		await expect(card(page, AREA + "a").locator(".wf-area-count")).toHaveText("1 now");
		await expect(panel.locator(".wf-item")).toHaveCount(0);
		// Actions view: the normal item list with the note
		await panel.locator('.wf-edit-view[data-wf-view="actions"]').click();
		await expect(panel).toContainText("Drag an item to edit its ring");
		await expect(panel.locator(".wf-item")).toHaveCount(1);
		await expect(panel.locator(".wf-area-card")).toHaveCount(0);
		await panel.locator('.wf-edit-view[data-wf-view="areas"]').click();
		// Done editing leaves edit mode, the panel stays
		await panel.locator(".wf-edit-done").click();
		await expect(page.locator(".wf-panel.wf-editing")).toHaveCount(0);
		await expect(panel.locator(".wf-item")).toHaveCount(1);
		// Esc: open card first, then edit mode, then the panel
		await panel.locator(".wf-edit-toggle").click();
		await openCard(page, AREA + "a");
		await page.keyboard.press("Escape");
		await expect(panel.locator(".wf-f-caption")).toHaveCount(0);
		await expect(page.locator(".wf-panel.wf-editing")).toHaveCount(1);
		await page.keyboard.press("Escape");
		await expect(page.locator(".wf-panel.wf-editing")).toHaveCount(0);
		await expect(panel).toHaveCount(1);
		await page.keyboard.press("Escape");
		await expect(panel).toHaveCount(0);
		expect(await page.evaluate(() => $tw.wiki.tiddlerExists("$:/temp/rimir/work-focus/edit"))).toBe(false);
	});

	test("typing a filter updates the live count after a pause", async ({ page }) => {
		await area(page, "a", { caption: "Alpha", "wf.level": "alert", "wf.filter": "[tag[WFTestHint]]" });
		await addTiddlers(page, [
			{ title: ITEM + "a1", tags: "WFTestAlert", caption: "First" },
			{ title: ITEM + "a2", tags: "WFTestAlert", caption: "Second" },
			{ title: ITEM + "h1", tags: "WFTestHint" },
		]);
		await check(page);
		await expect(chips(page)).toHaveCount(1);
		await expect(chips(page).first()).toContainText("1");
		await openEdit(page);
		await openCard(page, AREA + "a");
		const c = card(page, AREA + "a");
		const count = c.locator(".wf-area-count");
		const line = c.locator(".wf-live-line");
		await expect(count).toHaveText("1 now");
		await expect(line).toContainText("✓ 1 tiddler matches");
		// count every evaluation from here on
		await page.evaluate(() => {
			const lib = $tw.modules.execute("$:/plugins/rimir/work-focus/live-filter.js");
			const orig = lib.evaluate;
			window.wfEvaluations = 0;
			lib.evaluate = function() { window.wfEvaluations++; return orig.apply(this, arguments); };
			window.wfRestoreEval = () => { lib.evaluate = orig; };
		});
		const input = c.locator(".wf-f-filter");
		await input.click();
		await input.press("Control+a");
		await input.pressSequentially("[tag[WFTestAlert]]", { delay: 30 });
		// nothing evaluated while typing: the old count stays
		expect(await count.textContent()).toBe("1 now");
		expect(await page.evaluate(() => window.wfEvaluations)).toBe(0);
		await page.waitForTimeout(150);
		expect(await count.textContent()).toBe("1 now");
		await page.waitForTimeout(250);
		await expect(count).toHaveText("2 now");
		await expect(line).toContainText("✓ 2 tiddlers match: First, Second");
		// one evaluation per <$wf-live> (count and line) for the whole burst
		expect(await page.evaluate(() => window.wfEvaluations)).toBe(2);
		await page.evaluate(() => window.wfRestoreEval());
		// typing kept the focus: the whole text arrived
		expect(await field(page, AREA + "a", "wf.filter")).toBe("[tag[WFTestAlert]]");
		// the dock still shows the snapshot until ↻
		await expect(chips(page).first()).toContainText("1");
		await expect(chips(page).first()).toHaveClass(/wf-level-alert/);
		await page.locator(".wf-dock-refresh").click();
		await expect(chips(page).first()).toContainText("2");
		await expect(page.locator(".wf-panel.wf-editing")).toHaveCount(1);
	});

	test("a broken filter shows its error", async ({ page }) => {
		await area(page, "a", { caption: "Alpha", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await openEdit(page);
		await openCard(page, AREA + "a");
		const c = card(page, AREA + "a");
		await c.locator(".wf-f-filter").fill("[tag[unclosed");
		await expect(c.locator(".wf-live-line")).toContainText(/✗ .*Filter error/i);
		await expect(c.locator(".wf-live-line")).toHaveClass(/wf-live-bad/);
		await expect(c.locator(".wf-area-count")).toHaveText("!");
		await expect(c.locator(".wf-area-count")).toHaveAttribute("title", /Filter error/i);
	});

	test("level chips, name and date field write the area", async ({ page }) => {
		await area(page, "a", { caption: "Alpha", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await addTiddlers(page, [{ title: ITEM + "a1", tags: "WFTestAlert", due: "20261101", owner: "x" }]);
		await openEdit(page);
		await openCard(page, AREA + "a");
		const c = card(page, AREA + "a");
		await expect(c.locator(".wf-f-level")).toHaveCount(3);
		await expect(c.locator('.wf-f-level[data-level="alert"]')).toHaveClass(/wf-on/);
		await c.locator('.wf-f-level[data-level="warning"]').click();
		expect(await field(page, AREA + "a", "wf.level")).toBe("warning");
		await expect(c.locator('.wf-f-level[data-level="warning"]')).toHaveClass(/wf-on/);
		await expect(c.locator(".wf-card-head .wf-lvl")).toHaveText("warning");
		const name = c.locator(".wf-f-caption");
		await name.click();
		await name.press("Control+a");
		await name.pressSequentially("Do now", { delay: 20 });
		expect(await field(page, AREA + "a", "caption")).toBe("Do now");
		await expect(c.locator(".wf-card-name")).toHaveText("Do now");
		// date field: an input with the fields of the live matches as suggestions
		const date = c.locator(".wf-f-date-field");
		await date.click();
		await expect(date).toHaveAttribute("list", "wf-fields");
		await expect(page.locator("datalist#wf-fields option[value='due']")).toHaveCount(1);
		await expect(page.locator("datalist#wf-fields option[value='owner']")).toHaveCount(1);
		await date.pressSequentially("due", { delay: 20 });
		expect(await field(page, AREA + "a", "wf.date-field")).toBe("due");
		// wording: collapsed, placeholders are the defaults
		const when = c.locator(".wf-f-when");
		await expect(when.locator(".wf-f-when-past")).toBeHidden();
		await when.locator("summary").click();
		await expect(when.locator(".wf-f-when-past")).toHaveAttribute("placeholder", "<<n>>d ago");
		await expect(when.locator(".wf-f-when-today")).toHaveAttribute("placeholder", "today");
		await expect(when.locator(".wf-f-when-future")).toHaveAttribute("placeholder", "in <<n>>d");
		await when.locator(".wf-f-when-past").fill("overdue <<n>>d");
		expect(await field(page, AREA + "a", "wf.when-past")).toBe("overdue <<n>>d");
		// closing the card shows the summary
		await c.locator(".wf-card-head").click();
		await expect(c.locator(".wf-f-caption")).toHaveCount(0);
		await expect(c.locator(".wf-card-meta")).toContainText("due");
	});

	test("info picker adds, orders and removes parts", async ({ page }) => {
		await area(page, "a", { caption: "Alpha", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await openEdit(page);
		await openCard(page, AREA + "a");
		const picker = card(page, AREA + "a").locator(".wf-info-picker");
		const select = picker.locator("select");
		const add = picker.locator(".wf-info-add");
		await select.selectOption("field");
		await expect(picker.locator(".wf-info-param")).toBeVisible();
		await picker.locator(".wf-info-param").fill("parent");
		await add.click();
		await select.selectOption("date-relative");
		await add.click();
		await select.selectOption("modified-ago");
		await expect(picker.locator(".wf-info-param")).toHaveCount(0);
		await add.click();
		expect(await field(page, AREA + "a", "wf.info")).toBe("field:parent date-relative modified-ago");
		await expect(picker.locator(".wf-info-part")).toHaveCount(3);
		await picker.locator('.wf-info-part[data-token="date-relative"] .wf-info-left').click();
		expect(await field(page, AREA + "a", "wf.info")).toBe("date-relative field:parent modified-ago");
		await picker.locator('.wf-info-part[data-token="modified-ago"] .wf-info-remove').click();
		expect(await field(page, AREA + "a", "wf.info")).toBe("date-relative field:parent");
		await expect(picker.locator(".wf-info-part")).toHaveCount(2);
	});

	test("new area, new tab and renaming a tab", async ({ page }) => {
		const odd = 'Tab "x" [[y]]';
		await area(page, "a", { caption: "Alpha", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await openEdit(page);
		const panel = page.locator(".wf-panel");
		await expect(panel.locator(".wf-area-add")).toHaveText('+ area in "General"');
		await panel.locator(".wf-area-add").click();
		const first = NEW_AREAS + "new-area";
		await expect(card(page, first).locator(".wf-f-caption")).toHaveValue("New area");
		expect((await tagList(page)).slice(-1)).toEqual([first]);
		// "+ tab": a new tab with a new open area, and it becomes the active tab
		await panel.locator(".wf-tab-add").click();
		const second = NEW_AREAS + "new-area-2";
		await expect(card(page, second).locator(".wf-f-caption")).toBeVisible();
		await expect(panel.locator(".wf-tab")).toHaveCount(2);
		await expect(panel.locator(".wf-tab.wf-tab-on")).toContainText("New tab");
		expect(await field(page, second, "wf.tab")).toBe("New tab");
		await expect(card(page, AREA + "a")).toHaveCount(0);
		// rename the tab to an odd name: inline input, Enter saves
		await panel.locator(".wf-tab.wf-tab-on .wf-tab-rename").click();
		const input = panel.locator(".wf-tab-input");
		await expect(input).toBeFocused();
		await input.fill(odd);
		await input.press("Enter");
		await expect(panel.locator(".wf-tab-input")).toHaveCount(0);
		await expect(panel.locator(".wf-tab.wf-tab-on")).toContainText(odd);
		expect(await field(page, second, "wf.tab")).toBe(odd);
		expect(await field(page, AREA + "a", "wf.tab")).toBeUndefined();
		expect(await field(page, first, "wf.tab")).toBeFalsy();
		await expect(panel.locator(".wf-area-add")).toHaveText(`+ area in "${odd}"`);
		// Esc cancels a rename without leaving edit mode
		await panel.locator(".wf-tab.wf-tab-on .wf-tab-rename").click();
		await panel.locator(".wf-tab-input").fill("Other");
		await panel.locator(".wf-tab-input").press("Escape");
		await expect(panel.locator(".wf-tab-input")).toHaveCount(0);
		await expect(page.locator(".wf-panel.wf-editing")).toHaveCount(1);
		expect(await field(page, second, "wf.tab")).toBe(odd);
	});

	test("edits refresh the dock: a new area shows in the panel after Done editing, without the check button", async ({ page }) => {
		await addTiddlers(page, [{ title: ITEM + "r1", tags: "WFTestRefresh", caption: "Refresh item" }]);
		await check(page);
		await openEdit(page);
		const panel = page.locator(".wf-panel");
		await panel.locator(".wf-area-add").click();
		const created = NEW_AREAS + "new-area";
		await expect(card(page, created).locator(".wf-f-caption")).toBeVisible();
		await card(page, created).locator(".wf-f-filter").fill("[tag[WFTestRefresh]]");
		// the card shows the live count, the dock itself has not run the check yet
		await expect(card(page, created).locator(".wf-area-count")).toHaveText("1 now");
		await panel.locator(".wf-edit-done").click();
		await expect(page.locator(".wf-panel.wf-editing")).toHaveCount(0);
		await expect(panel.locator(".wf-section")).toHaveCount(1);
		await expect(panel.locator(".wf-section-head")).toHaveText("New area");
		await expect(panel.locator(`.wf-item[data-wf-item="${ITEM}r1"]`)).toHaveCount(1);
		await expect(chips(page)).toHaveCount(1);
	});

	test("dragging a card reorders and moves between tabs", async ({ page }) => {
		await area(page, "a1", { caption: "One", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await area(page, "a2", { caption: "Two", "wf.level": "warning", "wf.filter": "[tag[WFTestAlert]]" });
		await area(page, "a3", { caption: "Three", "wf.level": "hint", "wf.filter": "[tag[WFTestAlert]]" });
		await area(page, "b1", { caption: "Plan one", "wf.level": "hint", "wf.filter": "[tag[WFTestHint]]", "wf.tab": "Plan" });
		await addTiddlers(page, [{ title: AREA_TAG, list: [AREA + "a1", AREA + "a2", AREA + "a3", AREA + "b1"].map((t) => "[[" + t + "]]").join(" ") }]);
		await openEdit(page);
		await card(page, AREA + "a3").locator(".wf-grip").dragTo(card(page, AREA + "a1").locator(".wf-card-head"));
		await expect.poll(() => tagList(page)).toEqual([AREA + "a3", AREA + "a1", AREA + "a2", AREA + "b1"]);
		await expect(page.locator(".wf-panel .wf-area-card")).toHaveCount(3);
		expect(await page.locator(".wf-panel .wf-area-card").evaluateAll((l) => l.map((e) => e.getAttribute("data-wf-area-card")))).toEqual([AREA + "a3", AREA + "a1", AREA + "a2"]);
		// onto a tab: moves it to the end of that tab
		await card(page, AREA + "a1").locator(".wf-grip").dragTo(page.locator('.wf-panel .wf-tab[data-wf-tab="Plan"]'));
		await expect.poll(() => field(page, AREA + "a1", "wf.tab")).toBe("Plan");
		expect(await tagList(page)).toEqual([AREA + "a3", AREA + "a2", AREA + "b1", AREA + "a1"]);
		await expect(card(page, AREA + "a1")).toHaveCount(0);
	});

	test("deleting an area needs a second click", async ({ page }) => {
		await area(page, "a", { caption: "Alpha", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await area(page, "b", { caption: "Beta", "wf.level": "hint", "wf.filter": "[tag[WFTestHint]]" });
		await openEdit(page);
		await openCard(page, AREA + "a");
		const del = card(page, AREA + "a").locator(".wf-f-delete");
		await expect(del).toHaveText("Delete");
		await del.click();
		await expect(del).toHaveText("Delete? yes");
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), AREA + "a")).toBe(true);
		await del.click();
		await expect(card(page, AREA + "a")).toHaveCount(0);
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), AREA + "a")).toBe(false);
		expect(await tagList(page)).not.toContain(AREA + "a");
		await expect(card(page, AREA + "b")).toHaveCount(1);
		expect(await page.evaluate((t) => $tw.wiki.tiddlerExists(t), EDIT_AREA)).toBe(false);
	});

	test("edit mode screenshots", async ({ page }) => {
		test.skip(!SHOTS, "set WF_SHOTS to a directory to take edit mode screenshots");
		for (const palette of ["$:/palettes/Vanilla", "$:/palettes/SpartanNight"]) {
			await addTiddlers(page, [{ title: "$:/palette", text: palette }]);
			await area(page, "a", { caption: "Alert", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]", "wf.tab": "Tasks", "wf.date-field": "due", "wf.info": "date-relative field:parent field:assignee" });
			await area(page, "b", { caption: "Do now", "wf.level": "warning", "wf.filter": "[tag[WFTestWarn]]", "wf.tab": "Tasks", "wf.date-field": "due", "wf.info": "date-relative field:parent" });
			await area(page, "c", { caption: "Active", "wf.level": "hint", "wf.filter": "[tag[WFTestHint]]", "wf.tab": "Tasks", "wf.date-field": "active-from", "wf.info": "date-relative field:parent" });
			await area(page, "d", { caption: "Plan", "wf.level": "hint", "wf.filter": "[tag[WFTestPlan]]", "wf.tab": "Plan", "wf.info": "modified-ago" });
			await addTiddlers(page, [
				{ title: ITEM + "Prepare slides for steering", tags: "WFTestWarn", due: "20261107", parent: "Steering" },
				{ title: ITEM + "Call Anna about budget", tags: "WFTestWarn", due: "20261107" },
				{ title: ITEM + "Review offer draft", tags: "WFTestAlert", due: "20261105" },
				{ title: ITEM + "Send bidder questions", tags: "WFTestAlert", due: "20261104" },
				{ title: ITEM + "Write onboarding notes", tags: "WFTestAlert", due: "20261103" },
				{ title: ITEM + "Active task", tags: "WFTestHint" },
			]);
			await check(page);
			await openEdit(page);
			await openCard(page, AREA + "b");
			await card(page, AREA + "b").locator(".wf-f-filter").fill("[tag[WFTestWarn]] -[tag[done]]");
			await page.waitForTimeout(500);
			const name = `edit-${palette.endsWith("Night") ? "dark" : "light"}.png`;
			await page.screenshot({ path: require("path").join(SHOTS, name) });
			await sweep(page);
			await page.goto("/");
			await waitForTW(page);
		}
	});
});

test.describe("work-focus forms", () => {
	const SHOTS = process.env.WF_SHOTS;
	const S = "$:/plugins/rimir/work-focus/";
	const BUFFER = "$:/temp/rimir/work-focus/form/buffer";

	test.beforeEach(async ({ page }) => {
		// a Friday, like the ring specs
		await page.clock.setFixedTime(new Date(2026, 10, 6, 10, 0));
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto("/");
		await waitForTW(page);
		// the pw-edition's appify button sits in the bottom-right corner, over the foot of a full-height form
		await page.addStyleTag({ content: ".appify-fab-wrapper { display: none; }" });
		await sweep(page);
	});

	test.afterEach(async ({ page }) => sweep(page));

	const form = (page) => page.locator(".wf-form");
	const field = (page, title, name) => page.evaluate(({ title, name }) => { const t = $tw.wiki.getTiddler(title); return t ? t.fields[name] : undefined; }, { title, name });
	const real = (page, title) => page.evaluate((t) => $tw.wiki.tiddlerExists(t), title);

	// Opens a form the way the ring and the settings tab do: wf-form-open with variables
	async function openForm(page, vars) {
		await page.evaluate((vars) => {
			$tw.rootWidget.invokeActionString("\\import $:/plugins/rimir/work-focus/edit-engine\n<<wf-form-open>>", $tw.rootWidget, null,
				Object.assign({ kind: "action", target: "", item: "", area: "", preset: "", side: "right" }, vars));
		}, vars);
		await expect(form(page)).toBeVisible();
	}

	// An area with a date field and one item in it
	async function context(page) {
		await area(page, "a", { caption: "Alert", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]", "wf.date-field": "due" });
		await addTiddlers(page, [{ title: ITEM + "r", caption: "Review offer draft", tags: "WFTestAlert", due: "20261105" }]);
		return { item: ITEM + "r", area: AREA + "a" };
	}

	test("the action form edits a copy and Save writes it", async ({ page }) => {
		await openForm(page, { target: S + "actions/open" });
		await expect(form(page)).toHaveClass(/wf-side-right/);
		await expect(form(page).locator(".wf-form-title")).toContainText("Open");
		const caption = form(page).locator(".wf-f-caption");
		await expect(caption).toHaveValue("Open");
		await expect(caption).toBeFocused();
		// a blank label can't be saved, also for an existing action
		await caption.fill("");
		await expect(form(page).locator(".wf-form-save")).toBeDisabled();
		await caption.fill("Open it");
		await expect(form(page).locator(".wf-form-save")).toBeEnabled();
		expect(await field(page, BUFFER, "caption")).toBe("Open it");
		// nothing written before Save: still the shipped shadow only
		expect(await real(page, S + "actions/open")).toBe(false);
		expect(await field(page, S + "actions/open", "caption")).toBe("Open");
		await form(page).locator(".wf-form-save").click();
		await expect(form(page)).toHaveCount(0);
		expect(await real(page, S + "actions/open")).toBe(true);
		expect(await field(page, S + "actions/open", "caption")).toBe("Open it");
		expect(await field(page, S + "actions/open", "wf.group")).toBe("open");
		expect(await real(page, BUFFER)).toBe(false);
	});

	test("closing the form discards the buffer", async ({ page }) => {
		await openForm(page, { target: S + "actions/open" });
		await form(page).locator(".wf-f-caption").fill("Saved name");
		await form(page).locator(".wf-form-save").click();
		await openForm(page, { target: S + "actions/open" });
		await form(page).locator(".wf-f-caption").fill("Abandoned");
		await form(page).locator(".wf-f-order").fill("99");
		await form(page).locator(".wf-form-close").click();
		await expect(form(page)).toHaveCount(0);
		expect(await real(page, BUFFER)).toBe(false);
		expect(await field(page, S + "actions/open", "caption")).toBe("Saved name");
		expect(await field(page, S + "actions/open", "wf.order")).toBe("10");
		// Esc closes it the same way
		await openForm(page, { target: S + "actions/open" });
		await expect(form(page).locator(".wf-f-caption")).toHaveValue("Saved name");
		await form(page).locator(".wf-f-caption").fill("Abandoned again");
		await page.keyboard.press("Escape");
		await expect(form(page)).toHaveCount(0);
		expect(await field(page, S + "actions/open", "caption")).toBe("Saved name");
	});

	test("matches line follows the filter after a pause", async ({ page }) => {
		const ctx = await context(page);
		await openForm(page, { preset: JSON.stringify({ "wf.group": "open" }), ...ctx });
		const line = form(page).locator(".wf-live-line");
		// blank filter: shown for every item
		await expect(line).toHaveText('✓ matches "Review offer draft" in Alert');
		const filter = form(page).locator(".wf-f-filter");
		await filter.fill("[tag[WFTestNope]]");
		// the old line stays until the pause is over
		expect(await line.textContent()).toBe('✓ matches "Review offer draft" in Alert');
		await expect(line).toHaveText('✗ does not match "Review offer draft" in Alert');
		await expect(line).toHaveClass(/wf-live-bad/);
		await filter.fill("[<date-field>!is[blank]] :filter[<area>match[" + AREA + "a]]");
		await expect(line).toHaveText('✓ matches "Review offer draft" in Alert');
		// same context as the ring: currentTiddler is the item (not the buffer), action the action
		await filter.fill("[<currentTiddler>!prefix[$:/temp/]]");
		await expect(line).toHaveText('✓ matches "Review offer draft" in Alert');
		await filter.fill("[<action>prefix[$:/temp/]]");
		await expect(line).toHaveText('✓ matches "Review offer draft" in Alert');
		await filter.fill("[tag[unclosed");
		await expect(line).toContainText(/✗ .*Filter error/i);
		// typing kept the focus: the whole text arrived
		expect(await field(page, BUFFER, "wf.filter")).toBe("[tag[unclosed");
		// without an item there is nothing to match against
		await form(page).locator(".wf-form-close").click();
		await openForm(page, { target: S + "actions/open" });
		await expect(form(page).locator(".wf-live-line")).toHaveCount(0);
	});

	test("switching recipe shows its form and the preview", async ({ page }) => {
		const ctx = await context(page);
		await openForm(page, { target: S + "actions/open", ...ctx });
		const chip = (name) => form(page).locator(`.wf-recipe-chip[data-recipe="${name}"]`);
		await expect(chip("open")).toHaveClass(/wf-on/);
		for (const name of ["set-field", "move-date", "mute", "tag", "create", "open"]) await expect(chip(name)).toHaveCount(1);
		await expect(chip("open")).not.toHaveClass(/wf-dashed/);
		await expect(form(page).locator(".wf-recipe-form")).toHaveText("Nothing to set.");
		await expect(form(page).locator(".wf-preview")).toHaveText("Preview: opens Review offer draft");
		await chip("move-date").click();
		await expect(chip("move-date")).toHaveClass(/wf-on/);
		expect(await field(page, BUFFER, "wf.recipe")).toBe("move-date");
		const rf = form(page).locator(".wf-recipe-form");
		await expect(rf.locator(".wf-f-field")).toHaveAttribute("placeholder", /area's date field/);
		await expect(rf.locator('select.wf-f-to option[value="mon"]')).toHaveText("next Monday");
		await expect(rf.locator('select.wf-f-to option[value="+1d"]')).toHaveText("tomorrow");
		await rf.locator("select.wf-f-to").selectOption("mon");
		expect(await field(page, BUFFER, "wf.to")).toBe("mon");
		await expect(form(page).locator(".wf-preview")).toHaveText("Preview: due becomes Mon 9 Nov");
		// the free input edits the same value
		await expect(rf.locator("input.wf-f-to")).toHaveValue("mon");
		await rf.locator("input.wf-f-to").fill("+2d");
		await expect(form(page).locator(".wf-preview")).toHaveText("Preview: due becomes Sun 8 Nov");
		// the other recipe forms
		await chip("set-field").click();
		await expect(rf.locator(".wf-f-field")).toBeVisible();
		await expect(rf.locator(".wf-f-value")).toBeVisible();
		await chip("mute").click();
		await expect(rf.locator("select.wf-f-until")).toBeVisible();
		await chip("tag").click();
		await expect(rf.locator(".wf-f-tag")).toBeVisible();
		await chip("create").click();
		await expect(rf.locator(".wf-f-title")).toBeVisible();
		await expect(rf.locator(".wf-f-fields")).toBeVisible();
		// a recipe from outside the plugin is dashed
		await addTiddlers(page, [{ title: CONF + "recipe", tags: "$:/tags/rimir/work-focus/recipe", "wf.name": "wftest-bridge", caption: "Bridge thing" }]);
		await expect(chip("wftest-bridge")).toHaveClass(/wf-dashed/);
		await chip("wftest-bridge").click();
		await expect(rf).toHaveText("This recipe has no settings.");
		// still nothing written
		expect(await real(page, S + "actions/open")).toBe(false);
	});

	test("custom recipe shows the text editor and the variables", async ({ page }) => {
		await openForm(page, { preset: JSON.stringify({ "wf.group": "open" }) });
		const custom = form(page).locator(".wf-recipe-chip.wf-recipe-custom");
		await expect(custom).toHaveText("Custom…");
		// a new action has no recipe: Custom is the selected one
		await expect(custom).toHaveClass(/wf-on/);
		const rf = form(page).locator(".wf-recipe-form");
		for (const v of ["<<item>>", "<<area>>", "<<date-field>>", "<<value>>", "<<action>>"]) await expect(rf).toContainText(v);
		const text = rf.locator("textarea.wf-f-text");
		await text.fill('<$action-setfield $tiddler=<<item>> done="yes"/>');
		expect(await field(page, BUFFER, "text")).toBe('<$action-setfield $tiddler=<<item>> done="yes"/>');
		// picking a recipe and back to Custom keeps the text
		await form(page).locator('.wf-recipe-chip[data-recipe="open"]').click();
		await expect(rf.locator("textarea.wf-f-text")).toHaveCount(0);
		await custom.click();
		expect(await field(page, BUFFER, "wf.recipe")).toBe("");
		await expect(rf.locator("textarea.wf-f-text")).toHaveValue('<$action-setfield $tiddler=<<item>> done="yes"/>');
	});

	test("new group via the form appears in the group select", async ({ page }) => {
		await openForm(page, { target: S + "actions/open" });
		const select = form(page).locator("select.wf-f-group");
		await expect(select).toHaveValue("open");
		await expect(select.locator("option")).toContainText(["Move", "Mute", "Status", "Create", "Open"]);
		await select.selectOption({ label: "+ new group…" });
		// the group form replaces the action form
		await expect(form(page).locator(".wf-f-parent")).toBeVisible();
		await expect(form(page).locator(".wf-form-title")).toContainText("New group");
		expect(await field(page, "$:/temp/rimir/work-focus/form", "kind")).toBe("group");
		await form(page).locator(".wf-f-caption").fill("WF Test Group");
		await form(page).locator(".wf-f-icon").fill("★");
		await form(page).locator("select.wf-f-parent").selectOption("move");
		// a new group has no actions yet: no default to pick
		await expect(form(page).locator("select.wf-f-default-action")).toHaveCount(0);
		await form(page).locator(".wf-form-save").click();
		await expect(form(page)).toHaveCount(0);
		const g = NEW_GROUPS + "wf-test-group";
		expect(await field(page, g, "wf.name")).toBe("wf-test-group");
		expect(await field(page, g, "wf.parent")).toBe("move");
		expect(await field(page, g, "wf.icon")).toBe("★");
		// shown as a sub-group path in the action form's select
		await openForm(page, { target: S + "actions/open" });
		await expect(form(page).locator('select.wf-f-group option[value="wf-test-group"]')).toHaveText("Move ▸ WF Test Group");
		await form(page).locator("select.wf-f-group").selectOption("wf-test-group");
		await form(page).locator(".wf-form-save").click();
		// the group form offers its actions as default, and never itself or a descendant as parent
		await openForm(page, { kind: "group", target: S + "groups/move" });
		await expect(form(page).locator('select.wf-f-parent option[value="wf-test-group"]')).toHaveCount(0);
		await expect(form(page).locator('select.wf-f-parent option[value="move"]')).toHaveCount(0);
		await expect(form(page).locator("select.wf-f-default-action")).toHaveValue(S + "actions/day-strip");
		await form(page).locator(".wf-form-close").click();
		await openForm(page, { kind: "group", target: g });
		await expect(form(page).locator("select.wf-f-default-action option")).toContainText(["Open"]);
	});

	test("delete asks once more; a shipped action is hidden, not deleted", async ({ page }) => {
		await openForm(page, { target: S + "actions/mute" });
		await expect(form(page).locator(".wf-form-duplicate")).toHaveCount(1);
		const del = form(page).locator(".wf-form-delete");
		await expect(del).toHaveText("Hide");
		await del.click();
		await expect(del).toHaveText("Hide? yes");
		expect(await real(page, S + "actions/mute")).toBe(false);
		await del.click();
		await expect(form(page)).toHaveCount(0);
		expect(await field(page, S + "actions/mute", "wf.hidden")).toBe("yes");
		// a new action has neither Duplicate nor Delete
		await openForm(page, { preset: "" });
		await expect(form(page).locator(".wf-form-duplicate")).toHaveCount(0);
		await expect(form(page).locator(".wf-form-delete")).toHaveCount(0);
	});

	test("duplicate saves a copy and edits it", async ({ page }) => {
		await openForm(page, { target: S + "actions/open" });
		await form(page).locator(".wf-f-order").fill("15");
		await form(page).locator(".wf-form-duplicate").click();
		const copy = NEW_ACTIONS + "open-copy";
		await expect(form(page).locator(".wf-form-title")).toHaveText('✎ Action "Open (copy)"');
		await expect(form(page).locator(".wf-form-shipped")).toHaveCount(0);
		await expect(form(page).locator(".wf-f-caption")).toHaveValue("Open (copy)");
		expect(await field(page, copy, "wf.order")).toBe("15");
		expect(await field(page, copy, "wf.group")).toBe("open");
		expect(await real(page, S + "actions/open")).toBe(false);
		// the copy is a user action: Delete deletes it
		const del = form(page).locator(".wf-form-delete");
		await expect(del).toHaveText("Delete");
		await del.click();
		await del.click();
		await expect(form(page)).toHaveCount(0);
		expect(await real(page, copy)).toBe(false);
	});

	test("a click in the form keeps the panel open", async ({ page }) => {
		await page.locator(".wf-dock-toggle").click();
		await expect(page.locator(".wf-panel")).toBeVisible();
		await openForm(page, { target: S + "actions/open" });
		await form(page).locator(".wf-form-head").click();
		await expect(page.locator(".wf-panel")).toBeVisible();
		await form(page).locator(".wf-f-caption").click();
		await expect(page.locator(".wf-panel")).toBeVisible();
	});

	test("form screenshots", async ({ page }) => {
		test.skip(!SHOTS, "set WF_SHOTS to a directory to take form screenshots");
		const path = require("path");
		for (const palette of ["$:/palettes/Vanilla", "$:/palettes/SpartanNight"]) {
			const mode = palette.endsWith("Night") ? "dark" : "light";
			await addTiddlers(page, [{ title: "$:/palette", text: palette }]);
			const ctx = await context(page);
			await check(page);
			await page.locator(".wf-dock-toggle").click();
			await page.locator(".wf-panel .wf-edit-toggle").click();
			await openForm(page, { target: S + "actions/day-strip", ...ctx });
			await form(page).locator(".wf-f-filter").fill("[<area>!match[plan]]");
			await page.waitForTimeout(500);
			await page.screenshot({ path: path.join(SHOTS, `form-action-${mode}.png`) });
			await form(page).screenshot({ path: path.join(SHOTS, `form-action-${mode}-crop.png`) });
			await form(page).locator(".wf-form-close").click();
			await openForm(page, { kind: "group", target: S + "groups/move" });
			await page.waitForTimeout(200);
			await form(page).screenshot({ path: path.join(SHOTS, `form-group-${mode}.png`) });
			await form(page).locator(".wf-form-close").click();
			await sweep(page);
			await page.goto("/");
			await waitForTW(page);
		}
	});
});

test.describe("work-focus settings tab", () => {
	const S = "$:/plugins/rimir/work-focus/";
	const HOST = "WFTestSettingsHost"; // not a system title: those render as code

	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto("/");
		await waitForTW(page);
		await sweep(page);
		// the settings tab rendered in the story, as in the plugin's detail view
		await addTiddlers(page, [{ title: HOST, type: "text/vnd.tiddlywiki", text: `<$transclude $tiddler="${S}settings" $mode="block"/>` }]);
		await page.evaluate((t) => $tw.wiki.addTiddler({ title: "$:/StoryList", list: t }), HOST);
	});

	test.afterEach(async ({ page }) => {
		await page.evaluate((t) => { $tw.wiki.deleteTiddler("$:/StoryList"); $tw.wiki.deleteTiddler(t); }, HOST);
		await sweep(page);
	});

	const tile = (page) => page.locator(`.tc-tiddler-frame[data-tiddler-title="${HOST}"]`);

	test("settings tab opens areas and actions in their forms", async ({ page }) => {
		await area(page, "a", { caption: "Alpha", "wf.level": "alert", "wf.filter": "[tag[WFTestAlert]]" });
		await expect(tile(page).locator(".wf-set-row", { hasText: "Alpha" })).toHaveCount(1);
		// an area opens the panel in edit mode with its card open
		await tile(page).locator(".wf-set-row", { hasText: "Alpha" }).locator("button").click();
		await expect(page.locator(".wf-panel.wf-editing")).toHaveCount(1);
		await expect(page.locator(`.wf-panel .wf-area-card[data-wf-area-card="${AREA}a"] .wf-f-caption`)).toBeVisible();
		await page.keyboard.press("Escape");
		// a shipped action opens its form on the right, editing a copy ("Move date", not the group "Move")
		const formState = (name) => page.evaluate((n) => $tw.wiki.getTiddler("$:/temp/rimir/work-focus/form").fields[n], name);
		await page.evaluate(() => { $tw.wiki.deleteTiddler("$:/temp/rimir/work-focus/edit"); $tw.wiki.deleteTiddler("$:/temp/rimir/work-focus/edit-area"); });
		await tile(page).locator(".wf-set-row", { hasText: /^✎\s*Move date/ }).locator("button").click();
		await expect(page.locator(".wf-form")).toBeVisible();
		await expect(page.locator(".wf-form")).toHaveClass(/wf-side-right/);
		expect(await formState("kind")).toBe("action");
		expect(await formState("target")).toBe(S + "actions/day-strip");
		await expect(page.locator(".wf-form .wf-f-caption")).toHaveValue("Move date");
		// a group row opens the group form
		await tile(page).locator(".wf-set-row", { hasText: /^✎\s*Mute\s*mute/ }).locator("button").click();
		expect(await formState("kind")).toBe("group");
		expect(await formState("target")).toBe(S + "groups/mute");
		// + action and + group open blank forms
		await tile(page).getByRole("button", { name: "+ action" }).click();
		await expect(page.locator(".wf-form .wf-f-caption")).toHaveValue("");
		expect(await page.evaluate(() => $tw.wiki.getTiddler("$:/temp/rimir/work-focus/form").fields.kind)).toBe("action");
		await tile(page).getByRole("button", { name: "+ group" }).click();
		expect(await page.evaluate(() => $tw.wiki.getTiddler("$:/temp/rimir/work-focus/form").fields.kind)).toBe("group");
		// + area creates an area and opens it
		await tile(page).getByRole("button", { name: "+ area" }).click();
		await expect(page.locator(".wf-panel.wf-editing")).toHaveCount(1);
		await expect(page.locator(".wf-panel .wf-area-card .wf-f-caption")).toHaveValue("New area");
		// recipes list tells which have a form
		await expect(tile(page).locator(".wf-set-row", { hasText: /^Recipe move-date/ })).toContainText("has a form");
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
