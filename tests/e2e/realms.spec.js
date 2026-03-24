const { test, expect } = require("@playwright/test");
const { waitForTW, createTiddler, deleteTiddler, navigateToTiddler } = require("./helpers");

test.describe("realms plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test("realms settings UI renders in control panel", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();

		// Click realms in sidebar
		const sidebar = cp.locator(".rr-settings-sidebar");
		await sidebar.locator(".rr-settings-plugin-item").filter({ hasText: "realms" }).click();

		// Should show realm rows
		const content = cp.locator(".rr-settings-content");
		await expect(content.locator(".rlm-row").first()).toBeVisible();
	});

	test("realms settings shows catch-all header", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
		await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: "realms" }).click();

		const content = cp.locator(".rr-settings-content");
		await expect(content.locator(".rlm-catchall")).toBeVisible();
	});

	test("realm settings content renders realm entries", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
		await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: "realms" }).click();

		const content = cp.locator(".rr-settings-content");

		// Should have realm rows and buttons within them
		const rows = content.locator(".rlm-row");
		const count = await rows.count();
		expect(count).toBeGreaterThan(0);
	});

	test("realms API returns realm definitions", async ({ request }) => {
		const response = await request.get("/api/realms", {
			headers: { "X-Requested-With": "TiddlyWiki" },
		});
		expect(response.ok()).toBeTruthy();
		const data = await response.json();
		expect(data).toHaveProperty("work");
		expect(data).toHaveProperty("private");
	});

	test("realms API accepts PUT to toggle active state", async ({ request }) => {
		// Get current state
		const getResp = await request.get("/api/realms", {
			headers: { "X-Requested-With": "TiddlyWiki" },
		});
		const data = await getResp.json();
		const currentActive = data.work.active;

		// Toggle
		await request.put("/api/realms", {
			headers: {
				"Content-Type": "application/json",
				"X-Requested-With": "TiddlyWiki",
			},
			data: { work: { active: !currentActive } },
		});

		// Verify
		const verifyResp = await request.get("/api/realms", {
			headers: { "X-Requested-With": "TiddlyWiki" },
		});
		const updated = await verifyResp.json();
		expect(updated.work.active).toBe(!currentActive);

		// Restore
		await request.put("/api/realms", {
			headers: {
				"Content-Type": "application/json",
				"X-Requested-With": "TiddlyWiki",
			},
			data: { work: { active: currentActive } },
		});
	});

	test("active realm filters tiddlers from skinny list", async ({ request }) => {
		// Create a tiddler matching the "work" realm filter (prefix[WorkNote])
		await request.put("/recipes/default/tiddlers/WorkNoteTestRealm", {
			headers: { "Content-Type": "application/json", "X-Requested-With": "TiddlyWiki" },
			data: { title: "WorkNoteTestRealm", text: "test" },
		});

		// Verify it's in the skinny list when realm is inactive
		let skinny = await request.get("/recipes/default/tiddlers.json", {
			headers: { "X-Requested-With": "TiddlyWiki" },
		});
		let titles = (await skinny.json()).map((t) => t.title);
		expect(titles).toContain("WorkNoteTestRealm");

		// Activate the "work" realm (hide WorkNote* tiddlers)
		await request.put("/api/realms", {
			headers: { "Content-Type": "application/json", "X-Requested-With": "TiddlyWiki" },
			data: { work: { active: true } },
		});

		// Verify tiddler is now filtered out of skinny list
		skinny = await request.get("/recipes/default/tiddlers.json", {
			headers: { "X-Requested-With": "TiddlyWiki" },
		});
		titles = (await skinny.json()).map((t) => t.title);
		expect(titles).not.toContain("WorkNoteTestRealm");

		// Restore: deactivate realm and delete test tiddler
		await request.put("/api/realms", {
			headers: { "Content-Type": "application/json", "X-Requested-With": "TiddlyWiki" },
			data: { work: { active: false } },
		});
		await request.delete("/bags/default/tiddlers/WorkNoteTestRealm", {
			headers: { "X-Requested-With": "TiddlyWiki" },
		}).catch(() => {});
	});
});
