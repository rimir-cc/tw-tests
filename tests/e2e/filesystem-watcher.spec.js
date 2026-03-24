const { test, expect } = require("@playwright/test");
const { waitForTW } = require("./helpers");
const fs = require("fs");
const path = require("path");

const TIDDLERS_DIR = path.resolve("pw-edition/tiddlers");

test.describe("filesystem-watcher plugin", () => {
	// These tests write to disk and affect server state — run serially
	test.describe.configure({ mode: "serial" });

	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test("plugin is loaded", async ({ page }) => {
		const loaded = await page.evaluate(() => {
			return !!$tw.wiki.getTiddler("$:/plugins/rimir/filesystem-watcher");
		});
		expect(loaded).toBe(true);
	});

	test("reload-indicator module is loaded", async ({ page }) => {
		const loaded = await page.evaluate(() => {
			return !!$tw.modules.titles["$:/plugins/rimir/filesystem-watcher/reload-indicator.js"];
		});
		expect(loaded).toBe(true);
	});

	test("body does not have fsw-reload-needed class initially", async ({ page }) => {
		const hasClass = await page.evaluate(() => {
			return document.body.classList.contains("fsw-reload-needed");
		});
		expect(hasClass).toBe(false);
	});

	test("external file creation syncs to browser", async ({ page }) => {
		const filename = "FswTestTiddler.tid";
		const filepath = path.join(TIDDLERS_DIR, filename);

		// Write a .tid file directly to disk
		fs.writeFileSync(filepath, "title: FswTestTiddler\n\nCreated by Playwright test");

		try {
			// Wait for watcher to detect + syncer to poll (up to 6s)
			await page.waitForFunction(
				() => !!$tw.wiki.getTiddler("FswTestTiddler"),
				{ timeout: 8000 },
			);

			const text = await page.evaluate(() => {
				return $tw.wiki.getTiddlerText("FswTestTiddler");
			});
			expect(text).toBe("Created by Playwright test");
		} finally {
			// Cleanup
			if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
		}
	});

	test("external file modification syncs updated content", async ({ page }) => {
		const filename = "FswUpdateTest.tid";
		const filepath = path.join(TIDDLERS_DIR, filename);

		// Create initial file
		fs.writeFileSync(filepath, "title: FswUpdateTest\n\nVersion 1");

		try {
			await page.waitForFunction(
				() => !!$tw.wiki.getTiddler("FswUpdateTest"),
				{ timeout: 8000 },
			);

			// Modify the file
			fs.writeFileSync(filepath, "title: FswUpdateTest\n\nVersion 2");

			// Wait for updated content
			await page.waitForFunction(
				() => $tw.wiki.getTiddlerText("FswUpdateTest") === "Version 2",
				{ timeout: 8000 },
			);

			const text = await page.evaluate(() => {
				return $tw.wiki.getTiddlerText("FswUpdateTest");
			});
			expect(text).toBe("Version 2");
		} finally {
			if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
		}
	});

	test("external file deletion removes tiddler from wiki", async ({ page }) => {
		const filename = "FswDeleteTest.tid";
		const filepath = path.join(TIDDLERS_DIR, filename);

		// Create file
		fs.writeFileSync(filepath, "title: FswDeleteTest\n\nTo be deleted");

		try {
			await page.waitForFunction(
				() => !!$tw.wiki.getTiddler("FswDeleteTest"),
				{ timeout: 8000 },
			);

			// Delete the file
			fs.unlinkSync(filepath);

			// Wait for tiddler to disappear
			await page.waitForFunction(
				() => !$tw.wiki.getTiddler("FswDeleteTest"),
				{ timeout: 8000 },
			);

			const exists = await page.evaluate(() => {
				return !!$tw.wiki.getTiddler("FswDeleteTest");
			});
			expect(exists).toBe(false);
		} finally {
			if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
		}
	});

	test("system tiddler change triggers reload alert", async ({ page }) => {
		const filename = "$__FswSystemTest.tid";
		const filepath = path.join(TIDDLERS_DIR, filename);

		fs.writeFileSync(filepath, "title: $:/FswSystemTest\n\nSystem tiddler test");

		try {
			// Wait for alert to appear (system tiddlers trigger reload alert)
			await page.waitForFunction(
				() => !!$tw.wiki.getTiddler("alerts/filesystem-watcher-reload"),
				{ timeout: 8000 },
			);

			// Verify body gets the reload-needed class
			const hasClass = await page.evaluate(() => {
				return document.body.classList.contains("fsw-reload-needed");
			});
			expect(hasClass).toBe(true);

			// Verify temp flag
			const flag = await page.evaluate(() => {
				const t = $tw.wiki.getTiddler("$:/temp/filesystem-watcher-reload-needed");
				return t ? t.fields.text : null;
			});
			expect(flag).toBe("yes");
		} finally {
			if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
			// Clean up alert and reload flag so other tests aren't affected
			await page.evaluate(() => {
				$tw.wiki.deleteTiddler("alerts/filesystem-watcher-reload");
				$tw.wiki.deleteTiddler("$:/temp/filesystem-watcher-reload-needed");
				document.body.classList.remove("fsw-reload-needed");
			});
		}
	});
});
