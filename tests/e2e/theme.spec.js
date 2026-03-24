const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler, createTiddlerInBrowser, deleteTiddlerFromBrowser } = require("./helpers");

const TIDDLER = "ThemeTestTiddler";

test.describe("theme plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test.afterEach(async ({ page }) => {
		await deleteTiddlerFromBrowser(page, TIDDLER).catch(() => {});
	});

	test("callout renders with correct structure and type class", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/theme/callout" type="warning"><$fill $name="body">Warning message</$fill></$transclude>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const callout = frame.locator(".rr-callout.rr-callout-warning");
		await expect(callout).toBeVisible();
		await expect(callout.locator(".rr-callout-label")).toContainText("WARNING");
		await expect(callout).toContainText("Warning message");
	});

	test("all four callout types render", async ({ page }) => {
		for (const type of ["info", "warning", "tip", "danger"]) {
			const title = `${TIDDLER}-${type}`;
			await createTiddlerInBrowser(page, title, {
				text: `<$transclude $tiddler="$:/plugins/rimir/theme/callout" type="${type}"><$fill $name="body">msg</$fill></$transclude>`,
			});
			await navigateToTiddler(page, title);

			const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${title}"]`);
			await expect(frame.locator(`.rr-callout.rr-callout-${type}`)).toBeVisible();
			await expect(frame.locator(".rr-callout-label")).toContainText(type.toUpperCase());

			await deleteTiddlerFromBrowser(page, title);
		}
	});

	test("callout with custom label renders the custom label", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<$transclude $tiddler="$:/plugins/rimir/theme/callout" type="info" label="Note"><$fill $name="body">Body</$fill></$transclude>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		await expect(frame.locator(".rr-callout-label")).toContainText("Note");
	});

	test("notice renders with correct type class", async ({ page }) => {
		for (const type of ["warning", "info", "danger", "success"]) {
			const title = `${TIDDLER}-notice-${type}`;
			await createTiddlerInBrowser(page, title, {
				text: `<$transclude $tiddler="$:/plugins/rimir/theme/notice" type="${type}"><$fill $name="body">Notice content</$fill></$transclude>`,
			});
			await navigateToTiddler(page, title);

			const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${title}"]`);
			await expect(frame.locator(`.rr-notice.rr-notice-${type}`)).toBeVisible();
			await expect(frame.locator(".rr-notice")).toContainText("Notice content");

			await deleteTiddlerFromBrowser(page, title);
		}
	});

	test("rr-table class renders a styled table", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<table class="rr-table"><tr><th>Header</th></tr><tr><td>Cell</td></tr></table>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		const table = frame.locator(".rr-table");
		await expect(table).toBeVisible();
	});

	test("rr-badge classes render badges", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<span class="rr-badge-circle rr-badge-added">+</span> <span class="rr-badge-rect">label</span>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		await expect(frame.locator(".rr-badge-added")).toBeVisible();
		await expect(frame.locator(".rr-badge-rect")).toHaveText("label");
	});

	test("rr-status classes render status messages", async ({ page }) => {
		await createTiddlerInBrowser(page, TIDDLER, {
			text: '<div class="rr-status-loading">Loading...</div><div class="rr-status-error">Error!</div><div class="rr-status-success">Done</div><div class="rr-status-info">Info</div>',
		});
		await navigateToTiddler(page, TIDDLER);

		const frame = page.locator(`.tc-tiddler-frame[data-tiddler-title="${TIDDLER}"]`);
		await expect(frame.locator(".rr-status-loading")).toBeVisible();
		await expect(frame.locator(".rr-status-error")).toBeVisible();
		await expect(frame.locator(".rr-status-success")).toBeVisible();
		await expect(frame.locator(".rr-status-info")).toBeVisible();
	});
});
