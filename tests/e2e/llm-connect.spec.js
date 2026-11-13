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

	test("debug menu opens on bug button click and shows selected panel", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');

		await expect(frame.locator(".llm-chat-debug-menu")).not.toBeVisible();
		await expect(frame.locator(".llm-chat-debug-panel")).not.toBeVisible();

		await frame.locator(".llm-chat-btn-debug").scrollIntoViewIfNeeded();
		await frame.locator(".llm-chat-btn-debug").click();
		await expect(frame.locator(".llm-chat-debug-menu")).toBeVisible();

		// The debug menu is fixed-positioned relative to the bug button's viewport
		// rect; reliably off-screen in parallel test contexts. Dispatch the click
		// via JS so Playwright's viewport check is bypassed.
		await frame.locator('.llm-chat-debug-menu-item[data-panel-id="access"]').evaluate(el => el.click());
		await expect(frame.locator(".llm-chat-debug-panel")).toBeVisible();

		await frame.locator(".llm-chat-btn-debug").click();
		await frame.locator('.llm-chat-debug-menu-item[data-panel-id="access"]').evaluate(el => el.click());
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

	test("accessible tiddlers panel toggles via debug menu", async ({ page }) => {
		await createTiddlerInBrowser(page, "LlmChatTest", {
			text: '<$llm-chat/>',
		});
		await navigateToTiddler(page, "LlmChatTest");

		const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');

		await expect(frame.locator(".llm-chat-access-title")).not.toBeVisible();

		await frame.locator(".llm-chat-btn-debug").scrollIntoViewIfNeeded();
		await frame.locator(".llm-chat-btn-debug").click();
		// See sibling debug-menu test for why we dispatch click via JS.
		await frame.locator('.llm-chat-debug-menu-item[data-panel-id="access"]').evaluate(el => el.click());
		await expect(frame.locator(".llm-chat-access-title")).toBeVisible();

		await frame.locator(".llm-chat-btn-debug").click();
		await frame.locator('.llm-chat-debug-menu-item[data-panel-id="access"]').evaluate(el => el.click());
		await expect(frame.locator(".llm-chat-access-title")).not.toBeVisible();

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

	test.describe("connections", () => {
		test.afterEach(async ({ page }) => {
			await teardownConnections(page);
		});

		// === connections ===

		const CONN = "$:/config/rimir/llm-connect/connections/";
		const CONN_TAG = "$:/tags/rimir/llm-connect/connection";
		const TEMP_CHAT = "$:/temp/e2e/llm-connect-chat";

		async function setupConnections(page) {
			await page.evaluate(({CONN, CONN_TAG}) => {
				$tw.wiki.addTiddler({title: CONN + "local", tags: CONN_TAG, "connection-id": "local", "connection-name": "Local",
					"connection-type": "openai-compatible", endpoint: "http://llm.mock/v1", model: "mock-a"});
				$tw.wiki.addTiddler({title: CONN + "cloud", tags: CONN_TAG, "connection-id": "cloud", "connection-name": "Cloud",
					"connection-type": "claude", model: "claude-x"});
				$tw.wiki.addTiddler({title: "$:/config/rimir/llm-connect/keys/cloud", text: "sk-test"});
				$tw.wiki.addTiddler({title: "$:/config/rimir/llm-connect/default-connection", text: "cloud"});
				$tw.wiki.addTiddler({title: "$:/temp/rimir/llm-connect/models/local", type: "application/json",
					text: JSON.stringify([{id: "mock-a", label: "Mock A"}, {id: "mock-b", label: "Mock B"}])});
				$tw.wiki.addTiddler({title: "$:/temp/rimir/llm-connect/models/cloud", type: "application/json",
					text: JSON.stringify([{id: "claude-x", label: "Claude X"}])});
			}, {CONN, CONN_TAG});
		}

		async function teardownConnections(page) {
			await page.evaluate((TEMP_CHAT) => {
				["local", "cloud"].forEach(function(id) {
					$tw.wiki.deleteTiddler("$:/config/rimir/llm-connect/connections/" + id);
					$tw.wiki.deleteTiddler("$:/config/rimir/llm-connect/keys/" + id);
					$tw.wiki.deleteTiddler("$:/temp/rimir/llm-connect/models/" + id);
				});
				$tw.wiki.deleteTiddler("$:/config/rimir/llm-connect/default-connection");
				$tw.wiki.deleteTiddler(TEMP_CHAT);
			}, TEMP_CHAT);
			// flush deletions to the server so no files stay behind in pw-edition/tiddlers
			await page.waitForFunction(() => !$tw.syncer.isDirty());
		}

		test("model dropdown lists one header per connection and picking a model updates the label", async ({ page }) => {
			await setupConnections(page);
			await createTiddlerInBrowser(page, "LlmChatTest", { text: '<$llm-chat/>' });
			await navigateToTiddler(page, "LlmChatTest");
			const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');
			await expect(frame.locator(".llm-model-selector-btn")).toHaveText("Cloud / claude-x");

			await frame.locator(".llm-model-selector-btn").click();
			const headers = frame.locator(".llm-model-selector-provider-header");
			await expect(headers).toHaveText(["Cloud", "Local"]);
			await frame.locator('.llm-model-selector-item[data-connection="local"][data-model="mock-b"]').click();
			await expect(frame.locator(".llm-model-selector-btn")).toHaveText("Local / mock-b");
			const stored = await page.evaluate(() => ({
				def: $tw.wiki.getTiddlerText("$:/config/rimir/llm-connect/default-connection"),
				model: $tw.wiki.getTiddler("$:/config/rimir/llm-connect/connections/local").fields.model
			}));
			expect(stored).toEqual({def: "local", model: "mock-b"});

			await deleteTiddlerFromBrowser(page, "LlmChatTest");
		});

		test("old chat with only llm-provider opens locked on the matching connection", async ({ page }) => {
			await setupConnections(page);
			await page.evaluate((TEMP_CHAT) => {
				$tw.wiki.addTiddler({title: TEMP_CHAT, "llm-provider": "claude", "llm-model": "claude-old",
					"llm-messages": JSON.stringify([{role: "user", content: "hi"}])});
			}, TEMP_CHAT);
			await createTiddlerInBrowser(page, "LlmChatTest", { text: '<$llm-chat chatTiddler="' + TEMP_CHAT + '"/>' });
			await navigateToTiddler(page, "LlmChatTest");
			const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');
			await expect(frame.locator(".llm-model-selector-btn")).toContainText("Cloud / claude-old");
			await expect(frame.locator(".llm-model-selector-btn")).toContainText("\uD83D\uDD12");
			await expect(frame.locator(".llm-chat-connection-notice")).toBeHidden();

			await deleteTiddlerFromBrowser(page, "LlmChatTest");
		});

		test("chat whose connection was deleted shows a notice", async ({ page }) => {
			await setupConnections(page);
			await page.evaluate((TEMP_CHAT) => {
				$tw.wiki.addTiddler({title: TEMP_CHAT, "llm-connection": "gone", "llm-connection-name": "Old",
					"llm-connection-type": "claude", "llm-provider": "claude", "llm-model": "claude-old",
					"llm-messages": JSON.stringify([{role: "user", content: "hi"}])});
			}, TEMP_CHAT);
			await createTiddlerInBrowser(page, "LlmChatTest", { text: '<$llm-chat chatTiddler="' + TEMP_CHAT + '"/>' });
			await navigateToTiddler(page, "LlmChatTest");
			const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');
			await expect(frame.locator(".llm-chat-connection-notice")).toHaveText('Connection "Old" no longer exists, using "Cloud".');
			await expect(frame.locator(".llm-model-selector-btn")).toContainText("Cloud / claude-old");

			await deleteTiddlerFromBrowser(page, "LlmChatTest");
		});

			test("chat with messages and an unresolvable connection can pick a connection", async ({ page }) => {
				await setupConnections(page);
				await page.evaluate((TEMP_CHAT) => {
					$tw.wiki.addTiddler({title: TEMP_CHAT, "llm-connection": "gone", "llm-connection-name": "Old",
						"llm-connection-type": "nonexistent-type", "llm-model": "old-model",
						"llm-messages": JSON.stringify([{role: "user", content: "hi"}])});
				}, TEMP_CHAT);
				await createTiddlerInBrowser(page, "LlmChatTest", { text: '<$llm-chat chatTiddler="' + TEMP_CHAT + '"/>' });
				await navigateToTiddler(page, "LlmChatTest");
				const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');
				await expect(frame.locator(".llm-chat-connection-notice")).toHaveText("No connection of type nonexistent-type exists. Pick a connection.");

				// a send attempt changes nothing and keeps the text
				await frame.locator(".llm-chat-textarea").fill("hello");
				await frame.locator(".llm-chat-btn-send").click();
				await expect(frame.locator(".llm-chat-textarea")).toHaveValue("hello");
				const msgCount = await page.evaluate((t) => JSON.parse($tw.wiki.getTiddler(t).fields["llm-messages"]).length, TEMP_CHAT);
				expect(msgCount).toBe(1);

				await frame.locator(".llm-model-selector-btn").click();
				await frame.locator('.llm-model-selector-item[data-connection="local"][data-model="mock-a"]').click();
				await expect(frame.locator(".llm-model-selector-btn")).toContainText("Local / mock-a");
				await expect(frame.locator(".llm-chat-connection-notice")).toBeHidden();

				await deleteTiddlerFromBrowser(page, "LlmChatTest");
			});

			test("unresolvable chat keeps its stored connection fields after a save", async ({ page }) => {
				await setupConnections(page);
				await page.evaluate((TEMP_CHAT) => {
					$tw.wiki.addTiddler({title: TEMP_CHAT, "llm-connection": "gone", "llm-connection-name": "Old",
						"llm-connection-type": "nonexistent-type", "llm-model": "old-model",
						"llm-messages": JSON.stringify([{role: "user", content: "hi"}])});
				}, TEMP_CHAT);
				await createTiddlerInBrowser(page, "LlmChatTest", { text: '<$llm-chat chatTiddler="' + TEMP_CHAT + '"/>' });
				await navigateToTiddler(page, "LlmChatTest");
				const frame = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');
				await expect(frame.locator(".llm-model-selector-btn")).toBeVisible();
				// run the widget's real save path (saveMessages) on the existing messages
				await page.evaluate((t) => {
					const find = (w) => {
						if (w.saveMessages && w.chatTiddler === t) return w;
						for (const c of (w.children || [])) { const r = find(c); if (r) return r; }
						return null;
					};
					const w = find($tw.rootWidget);
					w.saveMessages(w.getMessages());
				}, TEMP_CHAT);
				const fields = await page.evaluate((t) => {
					const f = $tw.wiki.getTiddler(t).fields;
					return {c: f["llm-connection"], n: f["llm-connection-name"], t: f["llm-connection-type"]};
				}, TEMP_CHAT);
				expect(fields).toEqual({c: "gone", n: "Old", t: "nonexistent-type"});

				await deleteTiddlerFromBrowser(page, "LlmChatTest");
			});

	});
});
