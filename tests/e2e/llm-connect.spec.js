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

	// === v0.1.18-v0.1.24 tests ===

	test("accessible tiddlers panel toggles on eye button click", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');

		// Panel should be hidden initially
		await expect(frame.locator(".llm-chat-access-panel")).not.toBeVisible();

		// Click eye button to show
		await frame.locator(".llm-chat-btn-access").click();
		await expect(frame.locator(".llm-chat-access-panel")).toBeVisible();
		await expect(frame.locator(".llm-chat-access-title")).toBeVisible();

		// Click again to hide
		await frame.locator(".llm-chat-btn-access").click();
		await expect(frame.locator(".llm-chat-access-panel")).not.toBeVisible();

		await deleteTiddlerFromBrowser(page, "LlmChatTest");
	});

	test("pin button exists in chat panel header", async ({ page }) => {
		// Open the chat panel via state tiddler
		await page.evaluate(() => {
			$tw.wiki.addTiddler({ title: "$:/state/rimir/llm-connect/chat-open", text: "yes" });
		});
		await page.waitForSelector(".llm-chat-panel");

		const panel = page.locator(".llm-chat-panel");
		await expect(panel.locator(".llm-chat-btn-pin")).toBeVisible();

		// Close panel
		await page.evaluate(() => {
			$tw.wiki.addTiddler({ title: "$:/state/rimir/llm-connect/chat-open", text: "no" });
		});
	});

	test("pin button creates saved chat tiddler", async ({ page }) => {
		// Open the chat panel
		await page.evaluate(() => {
			$tw.wiki.addTiddler({ title: "$:/state/rimir/llm-connect/chat-open", text: "yes" });
		});
		await page.waitForSelector(".llm-chat-panel");

		const panel = page.locator(".llm-chat-panel");

		// Click pin button
		await panel.locator(".llm-chat-btn-pin").click();

		// Verify a saved chat tiddler was created with llm-pinned-save field
		const pinned = await page.evaluate(() => {
			var chatTid = $tw.wiki.getTiddler("$:/temp/rimir/llm-connect/toolbar-chat");
			return chatTid ? chatTid.fields["llm-pinned-save"] : null;
		});
		expect(pinned).toBe("yes");

		// Verify pin button has active class
		await expect(panel.locator(".llm-chat-btn-pin.llm-chat-btn-pin-active")).toBeVisible();

		// Close panel
		await page.evaluate(() => {
			$tw.wiki.addTiddler({ title: "$:/state/rimir/llm-connect/chat-open", text: "no" });
		});
	});

	test("unpin button clears pinned state", async ({ page }) => {
		// Open the chat panel
		await page.evaluate(() => {
			$tw.wiki.addTiddler({ title: "$:/state/rimir/llm-connect/chat-open", text: "yes" });
		});
		await page.waitForSelector(".llm-chat-panel");

		const panel = page.locator(".llm-chat-panel");

		// Pin first
		await panel.locator(".llm-chat-btn-pin").click();
		await expect(panel.locator(".llm-chat-btn-pin.llm-chat-btn-pin-active")).toBeVisible();

		// Click again to unpin
		await panel.locator(".llm-chat-btn-pin").click();

		// Verify llm-pinned-save is cleared
		const pinned = await page.evaluate(() => {
			var chatTid = $tw.wiki.getTiddler("$:/temp/rimir/llm-connect/toolbar-chat");
			return chatTid ? (chatTid.fields["llm-pinned-save"] || "") : "";
		});
		expect(pinned).toBe("");

		// Verify pin button no longer has active class
		await expect(panel.locator(".llm-chat-btn-pin.llm-chat-btn-pin-active")).not.toBeVisible();

		// Close panel
		await page.evaluate(() => {
			$tw.wiki.addTiddler({ title: "$:/state/rimir/llm-connect/chat-open", text: "no" });
		});
	});

	test("switching protection mode negates the filter", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat chatTiddler="$:/temp/llm-negate-test"/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');

		// Open protection panel
		await frame.locator(".llm-chat-btn-shield").click();
		await expect(frame.locator(".llm-chat-protection-row")).toBeVisible();

		// Ensure mode is "allow" and type a filter
		const modeSelect = frame.locator(".llm-chat-protection-mode-select");
		await modeSelect.selectOption("allow");
		const filterInput = frame.locator(".llm-chat-protection-input");
		await filterInput.fill("[[Foo]] [tag[bar]]");
		// Trigger change event so it saves
		await filterInput.dispatchEvent("change");

		// Switch to deny mode
		await modeSelect.selectOption("deny");

		// Verify input now shows negated filter
		const denyValue = await filterInput.inputValue();
		expect(denyValue).toContain("-[[Foo]]");
		expect(denyValue).toContain("-[tag[bar]]");

		// Switch back to allow
		await modeSelect.selectOption("allow");

		// Verify input shows un-negated filter
		const allowValue = await filterInput.inputValue();
		expect(allowValue).toContain("[[Foo]]");
		expect(allowValue).toContain("[tag[bar]]");
		expect(allowValue).not.toContain("-[[Foo]]");

		await deleteTiddlerFromBrowser(page, "LlmChatTest");
		await deleteTiddlerFromBrowser(page, "$:/temp/llm-negate-test");
	});

	test("create_tiddler tool schema includes basetitle parameter", async ({ page }) => {
		const schema = await page.evaluate(() => {
			var tid = $tw.wiki.getTiddler("$:/plugins/rimir/llm-connect/tools/create-tiddler");
			return tid ? JSON.parse(tid.fields["tool-schema"]) : null;
		});
		expect(schema).not.toBeNull();
		expect(schema.properties).toHaveProperty("basetitle");
		expect(schema.properties.basetitle.type).toBe("string");
	});

	test("creation rules config tiddler exists", async ({ page }) => {
		const exists = await page.evaluate(() => {
			return $tw.wiki.tiddlerExists("$:/config/rimir/llm-connect/creation-rules") ||
				$tw.wiki.isShadowTiddler("$:/config/rimir/llm-connect/creation-rules");
		});
		expect(exists).toBe(true);
	});

	test("protection mode select has allow and deny options", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');

		// Open protection panel
		await frame.locator(".llm-chat-btn-shield").click();
		await expect(frame.locator(".llm-chat-protection-row")).toBeVisible();

		// Verify select exists with both options
		const modeSelect = frame.locator(".llm-chat-protection-mode-select");
		await expect(modeSelect).toBeVisible();

		const options = modeSelect.locator("option");
		await expect(options).toHaveCount(2);

		const values = await options.evaluateAll(opts => opts.map(o => o.value));
		expect(values).toContain("allow");
		expect(values).toContain("deny");

		await deleteTiddlerFromBrowser(page, "LlmChatTest");
	});

	test("pin context menu element exists in chat panel", async ({ page }) => {
		// Open the chat panel
		await page.evaluate(() => {
			$tw.wiki.addTiddler({ title: "$:/state/rimir/llm-connect/chat-open", text: "yes" });
		});
		await page.waitForSelector(".llm-chat-panel");

		const panel = page.locator(".llm-chat-panel");
		// The pin menu div is rendered in the template (hidden by default)
		const pinMenu = panel.locator(".llm-chat-pin-menu");
		await expect(pinMenu).toHaveCount(1);

		// Close panel
		await page.evaluate(() => {
			$tw.wiki.addTiddler({ title: "$:/state/rimir/llm-connect/chat-open", text: "no" });
		});
	});
});
