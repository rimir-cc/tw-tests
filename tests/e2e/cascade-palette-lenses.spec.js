const { test, expect } = require("@playwright/test");
const {
	waitForTW, openPalette, closePaletteIfOpen,
	createTiddlerInBrowser, deleteTiddlerFromBrowser, paletteType,
} = require("./helpers");

/**
 * cascade-palette lenses (Phase B/C) — browser-only behaviors that unit tests
 * can't reach: the lens-slot CHOOSER pills now live inside the view→channel
 * Structure strip (the standalone per-slot lens strips were removed in
 * 0.0.118), and the actual DOM rendering of a row's lens decorations — the
 * annotation chip (filter projection), the rich annotation (template
 * projection), and the name replacement — on real data rows.
 *
 * Activation model: a lens is picked per VIEW slot via the chooser pill, which
 * writes ca-view-lens-<slot> on the view (the enum-cycle + scratchpad mechanics
 * are unit-tested in test-lens-choosers.js / test-view-editor.js). Here we seed
 * a small data view with the slot already pointed at a lens — the real
 * persisted shape — and assert the live decoration DOM, plus that the chooser
 * pills render in the strip.
 *
 * DOM landmarks:
 *   .rcp-view-config-strip                       Structure strip
 *   .rcp-view-config-pill-lens-view              view-default lens chooser pill
 *   .rcp-view-strip .rcp-view-pill               view chooser pills
 *   .rcp-results .rcp-row                        result rows
 *   .rcp-row-name / .rcp-row-annotation{,-rich}  decorations
 */

// These tests mutate the shared (single) pw-edition server wiki — seeding
// lens + view + data tiddlers that are visible across browser contexts. Run
// them serially so concurrent seeds/cleanups across workers can't race.
test.describe.configure({ mode: "serial" });

const LENS_TAG = "$:/tags/rimir/cascade-palette/lens";
const CHANNEL_TAG = "$:/tags/rimir/cascade-palette/channel";
const VIEW_TAG = "$:/tags/rimir/cascade-palette/view";

const CHANNEL = "$:/zlens/channel";
const VIEW = "$:/zlens/view";

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

// Seed a flat data view whose single channel lists [tag[ZLensTag]] rows. When
// slotField is given the view's matching lens slot is pointed at lensTitle —
// the persisted shape the chooser pill writes — so the decoration is baked at
// view load and applied to every data row.
async function seedView(page, trk, slotField, lensTitle) {
	await trk.add(CHANNEL, {
		tags: [CHANNEL_TAG], type: "text/vnd.tiddlywiki",
		"ca-channel-name": "ZLensCh", "ca-channel-roots": "[tag[ZLensTag]]",
	});
	const viewFields = {
		tags: [VIEW_TAG], type: "text/vnd.tiddlywiki",
		"ca-view-name": "ZLensView", "ca-view-channels": CHANNEL,
		"ca-view-include-entries": "no",
	};
	if (slotField) viewFields[slotField] = lensTitle;
	await trk.add(VIEW, viewFields);
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

	test("the view-default lens-slot chooser pills render in the Structure strip", async ({ page }) => {
		await openPalette(page);
		const strip = page.locator(".rcp-view-config-strip");
		await expect(strip).toBeAttached();
		// One view-default chooser per inheritable slot (name / icon / note),
		// leading the active view's structure pills.
		await expect(strip.locator(".rcp-view-config-pill-lens-view")).toHaveCount(3);
	});

	test("an annotation FILTER lens renders a .rcp-row-annotation chip on a data row", async ({ page }) => {
		await trk.add("ZLensRowOne", { tags: ["ZLensTag"], text: "row one", zanno: "ON-VACATION" });
		await trk.add("$:/zlens/anno", {
			tags: [LENS_TAG], type: "text/vnd.tiddlywiki",
			"ca-lens-name": "ZAnnoFilter", "ca-lens-chip": "ZAnnoFilter",
			"ca-lens-annotation-filter": "[<currentTiddler>get[zanno]]",
		});
		await seedView(page, trk, "ca-view-lens-annotation", "$:/zlens/anno");

		await openPalette(page);
		await activateView(page, "ZLensView");
		await paletteType(page, "ZLensRowOne");

		const row = page.locator(".rcp-results .rcp-row", { hasText: "ZLensRowOne" }).first();
		await expect(row).toBeVisible();
		// The annotation slot points at the filter lens → the projected chip.
		await expect(row.locator(".rcp-row-annotation")).toHaveText("ON-VACATION");
	});

	test("an annotation TEMPLATE lens renders rich markup (.rcp-row-annotation-rich)", async ({ page }) => {
		await trk.add("ZLensRowTpl", { tags: ["ZLensTag"], text: "row tpl" });
		await trk.add("$:/zlens/anno-tpl", {
			tags: [LENS_TAG], type: "text/vnd.tiddlywiki",
			"ca-lens-name": "ZAnnoTpl", "ca-lens-chip": "ZAnnoTpl",
			"ca-lens-annotation-template":
				"<span class=\"ztpl-badge\">TPL-<$text text=<<currentTiddler>>/></span>",
		});
		await seedView(page, trk, "ca-view-lens-annotation", "$:/zlens/anno-tpl");

		await openPalette(page);
		await activateView(page, "ZLensView");
		await paletteType(page, "ZLensRowTpl");

		const row = page.locator(".rcp-results .rcp-row", { hasText: "ZLensRowTpl" }).first();
		await expect(row).toBeVisible();

		const rich = row.locator(".rcp-row-annotation-rich");
		await expect(rich).toHaveCount(1);
		// The template rendered as real markup, with currentTiddler = the row.
		await expect(rich.locator(".ztpl-badge")).toContainText("TPL-ZLensRowTpl");
	});

	test("a NAME lens replaces the row name", async ({ page }) => {
		await trk.add("ZLensRowName", { tags: ["ZLensTag"], text: "row" });
		await trk.add("$:/zlens/name", {
			tags: [LENS_TAG], type: "text/vnd.tiddlywiki",
			"ca-lens-name": "ZNameLens", "ca-lens-chip": "ZNameLens",
			"ca-lens-name-filter": "[<currentTiddler>addprefix[NL-]]",
		});
		await seedView(page, trk, "ca-view-lens-name", "$:/zlens/name");

		await openPalette(page);
		await activateView(page, "ZLensView");
		// Search matches the underlying title (also a substring of the projection).
		await paletteType(page, "ZLensRowName");

		// The name slot shows the custom projection (title with a prefix).
		await expect(
			page.locator(".rcp-results .rcp-row .rcp-row-name", { hasText: "NL-ZLensRowName" })
		).toHaveCount(1);
	});
});
