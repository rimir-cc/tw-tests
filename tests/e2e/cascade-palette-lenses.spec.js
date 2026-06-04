const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen,
	createTiddlerInBrowser, deleteTiddlerFromBrowser, paletteType,
} = require("./helpers");

/**
 * cascade-palette H4 lenses — browser-only behaviors that unit tests can't
 * reach: the per-slot lens strips, and the actual DOM rendering of the
 * annotation chip (filter projection) and rich template projection on
 * real data rows.
 *
 * Strategy: seed a non-system data tiddler + a lens tiddler in the browser
 * store, open the palette, switch to the shipped "All tiddlers" view (whose
 * rows ARE data rows — `ca-view-roots: [!is[system]]`), narrow to the seeded
 * row, click the lens's pill to activate it, and assert the decoration DOM.
 * Lens pills + view pills activate on mousedown, which `.click()` fires.
 *
 * DOM landmarks:
 *   .rcp-view-strip .rcp-view-pill          view chooser pills
 *   .rcp-lens-strip-{name,icon,annotation}  per-slot lens strips
 *   .rcp-lens-pill{,-active,-new}           lens pills
 *   .rcp-results .rcp-row                    result rows
 *   .rcp-row-name / .rcp-row-annotation{,-rich}
 */

// These tests mutate the shared (single) pw-edition server wiki — seeding
// lens + data tiddlers that are visible across browser contexts. Run them
// serially so concurrent seeds/cleanups across workers can't race.
test.describe.configure({ mode: "serial" });

const LENS_TAG = "$:/tags/rimir/cascade-palette/lens";

// Track everything we add so each test leaves the (shared, gitignored)
// pw-edition store clean for the next — fresh browser context still reloads
// server-persisted tiddlers.
function tracker(page) {
	const titles = [];
	return {
		async add(title, fields) {
			titles.push(title);
			await createTiddlerInBrowser(page, title, fields);
		},
		async cleanup() {
			for (const t of titles) await deleteTiddlerFromBrowser(page, t);
		},
	};
}

async function activateView(page, viewName) {
	const pill = page.locator(".rcp-view-strip .rcp-view-pill", { hasText: viewName });
	await pill.first().click();
	await page.waitForTimeout(150);
}

test.describe("cascade-palette lenses", () => {
	let trk;

	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
		trk = tracker(page);
	});

	test.afterEach(async ({ page }) => {
		await closePaletteIfOpen(page);
		if (trk) await trk.cleanup();
	});

	test("the name + icon lens strips render with pills", async ({ page }) => {
		await openPalette(page);
		// Name lenses (Title / Caption) ship with the plugin → the name strip
		// is present with at least the synthetic "(default)" head + lens pills.
		const nameStrip = page.locator(".rcp-lens-strip-name");
		await expect(nameStrip).toBeAttached();
		expect(await nameStrip.locator(".rcp-lens-pill").count()).toBeGreaterThan(1);
		// Icon strip exists too (Kind icon lens ships).
		await expect(page.locator(".rcp-lens-strip-icon")).toBeAttached();
	});

	test("an annotation FILTER lens renders a .rcp-row-annotation chip on a data row", async ({ page }) => {
		await trk.add("ZLensRowOne", { text: "row one", zanno: "ON-VACATION" });
		await trk.add("$:/zlens/anno", {
			tags: [LENS_TAG], type: "text/vnd.tiddlywiki",
			"ca-lens-name": "ZAnnoFilter", "ca-lens-chip": "ZAnnoFilter",
			"ca-lens-annotation-filter": "[<currentTiddler>get[zanno]]",
		});
		await openPalette(page);
		await activateView(page, "All tiddlers");
		await paletteType(page, "ZLensRowOne");

		const row = page.locator(".rcp-results .rcp-row", { hasText: "ZLensRowOne" }).first();
		await expect(row).toBeVisible();
		// Not decorated until the lens is active.
		await expect(row.locator(".rcp-row-annotation")).toHaveCount(0);

		// Activate the lens via its pill, then the chip appears.
		const pill = page.locator(".rcp-lens-strip-annotation .rcp-lens-pill", {
			hasText: "ZAnnoFilter",
		});
		await pill.first().click();
		await page.waitForTimeout(150);
		await expect(row.locator(".rcp-row-annotation")).toHaveText("ON-VACATION");
	});

	test("an annotation TEMPLATE lens renders rich markup (.rcp-row-annotation-rich)", async ({ page }) => {
		await trk.add("ZLensRowTpl", { text: "row tpl" });
		await trk.add("$:/zlens/anno-tpl", {
			tags: [LENS_TAG], type: "text/vnd.tiddlywiki",
			"ca-lens-name": "ZAnnoTpl", "ca-lens-chip": "ZAnnoTpl",
			"ca-lens-annotation-template":
				"<span class=\"ztpl-badge\">TPL-<$text text=<<currentTiddler>>/></span>",
		});
		await openPalette(page);
		await activateView(page, "All tiddlers");
		await paletteType(page, "ZLensRowTpl");

		const row = page.locator(".rcp-results .rcp-row", { hasText: "ZLensRowTpl" }).first();
		await expect(row).toBeVisible();

		const pill = page.locator(".rcp-lens-strip-annotation .rcp-lens-pill", {
			hasText: "ZAnnoTpl",
		});
		await pill.first().click();
		await page.waitForTimeout(150);

		const rich = row.locator(".rcp-row-annotation-rich");
		await expect(rich).toHaveCount(1);
		// The template rendered as real markup, with currentTiddler = the row.
		await expect(rich.locator(".ztpl-badge")).toContainText("TPL-ZLensRowTpl");
	});

	test("a NAME lens replaces the row name", async ({ page }) => {
		// No caption → the default caption-then-title name lens shows the
		// title, so search-by-title narrows AND the row displays its title.
		// Activating a custom name lens that transforms the title changes the
		// displayed name.
		await trk.add("ZLensRowName", { text: "row" });
		await trk.add("$:/zlens/name", {
			tags: [LENS_TAG], type: "text/vnd.tiddlywiki",
			"ca-lens-name": "ZNameLens", "ca-lens-chip": "ZNameLens",
			"ca-lens-name-filter": "[<currentTiddler>addprefix[NL-]]",
		});
		await openPalette(page);
		await activateView(page, "All tiddlers");
		await paletteType(page, "ZLensRowName");

		const row = page.locator(".rcp-results .rcp-row", { hasText: "ZLensRowName" }).first();
		await expect(row).toBeVisible();
		// Default name lens shows the bare title.
		await expect(row.locator(".rcp-row-name")).toHaveText("ZLensRowName");

		await page.locator(".rcp-lens-strip-name .rcp-lens-pill", { hasText: "ZNameLens" })
			.first().click();
		await page.waitForTimeout(150);
		// The name slot now shows the custom projection (title with a prefix).
		await expect(
			page.locator(".rcp-results .rcp-row .rcp-row-name", { hasText: "NL-ZLensRowName" })
		).toHaveCount(1);
	});
});
