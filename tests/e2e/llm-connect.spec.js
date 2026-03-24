const { test, expect } = require("@playwright/test");
const { waitForTW, navigateToTiddler, createTiddlerInBrowser, deleteTiddlerFromBrowser } = require("./helpers");

test.describe("llm-connect plugin", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/");
		await waitForTW(page);
	});

	test("plugin is loaded", async ({ page }) => {
		const loaded = await page.evaluate(() => {
			return !!$tw.wiki.getTiddler("$:/plugins/rimir/llm-connect");
		});
		expect(loaded).toBe(true);
	});

	test("chat widget module is registered", async ({ page }) => {
		const exists = await page.evaluate(() => {
			return !!$tw.modules.titles["$:/plugins/rimir/llm-connect/chat-widget"];
		});
		expect(exists).toBe(true);
	});

	test("action widget module is registered", async ({ page }) => {
		const exists = await page.evaluate(() => {
			return !!$tw.modules.titles["$:/plugins/rimir/llm-connect/action-widget"];
		});
		expect(exists).toBe(true);
	});

	test("chat widget renders container and input area", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');
		await expect(frame.locator(".llm-chat-container")).toBeVisible();
		await expect(frame.locator(".llm-chat-messages")).toBeVisible();
		await expect(frame.locator(".llm-chat-textarea")).toBeVisible();

		await deleteTiddlerFromBrowser(page, "LlmChatTest");
	});

	test("chat widget has send and clear buttons", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');
		await expect(frame.locator(".llm-chat-btn-send")).toBeVisible();
		await expect(frame.locator(".llm-chat-btn-clear")).toBeVisible();

		await deleteTiddlerFromBrowser(page, "LlmChatTest");
	});

	test("chat widget has model selector", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');
		await expect(frame.locator(".llm-model-selector-btn")).toBeVisible();

		await deleteTiddlerFromBrowser(page, "LlmChatTest");
	});

	test("model selector dropdown opens on click", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');
		await frame.locator(".llm-model-selector-btn").click();
		await expect(frame.locator(".llm-model-selector-dropdown")).toBeVisible();

		await deleteTiddlerFromBrowser(page, "LlmChatTest");
	});

	test("debug panel toggles on bug button click", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');

		// Debug panel should be hidden initially
		await expect(frame.locator(".llm-chat-debug-panel")).not.toBeVisible();

		// Click debug button
		await frame.locator(".llm-chat-btn-debug").click();
		await expect(frame.locator(".llm-chat-debug-panel")).toBeVisible();

		// Click again to hide
		await frame.locator(".llm-chat-btn-debug").click();
		await expect(frame.locator(".llm-chat-debug-panel")).not.toBeVisible();

		await deleteTiddlerFromBrowser(page, "LlmChatTest");
	});

	test("context filter row toggles on paperclip button", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');

		// Context row hidden initially
		await expect(frame.locator(".llm-chat-context-row")).not.toBeVisible();

		// Click paperclip
		await frame.locator(".llm-chat-btn-context").click();
		await expect(frame.locator(".llm-chat-context-row")).toBeVisible();
		await expect(frame.locator(".llm-chat-context-input")).toBeVisible();

		await deleteTiddlerFromBrowser(page, "LlmChatTest");
	});

	test("protection filter row toggles on shield button", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');

		await expect(frame.locator(".llm-chat-protection-row")).not.toBeVisible();

		await frame.locator(".llm-chat-btn-shield").click();
		await expect(frame.locator(".llm-chat-protection-row")).toBeVisible();

		await deleteTiddlerFromBrowser(page, "LlmChatTest");
	});

	test("settings render in settings hub", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
		await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: /llm.connect/i }).click();

		const content = cp.locator(".rr-settings-content");
		await expect(content.locator(".rr-settings-header")).toBeVisible();
	});

	test("settings show tools table", async ({ page }) => {
		await navigateToTiddler(page, "$:/ControlPanel");
		const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
		await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
		await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
		await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: /llm.connect/i }).click();

		const content = cp.locator(".rr-settings-content");
		// Should have the tools table with built-in tools
		const toolTable = content.locator(".llm-tool-table");
		await expect(toolTable).toBeVisible();
		const rows = toolTable.locator("tr");
		const count = await rows.count();
		// Header + at least a few built-in tools
		expect(count).toBeGreaterThan(3);
	});

	test("built-in tools are registered as shadow tiddlers", async ({ page }) => {
		const tools = await page.evaluate(() => {
			return $tw.wiki.filterTiddlers("[all[shadows]has[tool-name]]");
		});
		expect(tools.length).toBeGreaterThan(3);
	});

	test("clear button resets chat messages", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');

		// Type something in textarea
		await frame.locator(".llm-chat-textarea").fill("Hello world");
		await expect(frame.locator(".llm-chat-textarea")).toHaveValue("Hello world");

		// Click clear
		await frame.locator(".llm-chat-btn-clear").click();

		// Messages area should be empty (no message elements)
		const messages = frame.locator(".llm-chat-message");
		await expect(messages).toHaveCount(0);

		await deleteTiddlerFromBrowser(page, "LlmChatTest");
	});
});
