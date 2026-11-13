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
		await content.locator(".rr-settings-tabs-strip .rr-settings-tab").filter({ hasText: "Tools" }).click();
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

	test.describe("settings tabs", () => {
		const SETTINGS = "$:/plugins/rimir/llm-connect/settings";
		const CONN = "$:/config/rimir/llm-connect/connections/";
		const CONN_TAG = "$:/tags/rimir/llm-connect/connection";
		const KEYS = "$:/config/rimir/llm-connect/keys/";
		const NAME = 'My "llama" [[x]]';

		test.afterEach(async ({ page }) => {
			await page.evaluate(() => {
				const prefixes = ["$:/config/rimir/llm-connect/connections/", "$:/config/rimir/llm-connect/keys/",
					"$:/temp/rimir/llm-connect/models/", "$:/temp/rimir/llm-connect/fetch-status/",
					"$:/state/rimir/llm-connect/connection-", "$:/temp/rimir/llm-connect/add-connection"];
				$tw.wiki.allTitles().forEach(function(t) {
					if (prefixes.some(function(p) { return t.indexOf(p) === 0; })) $tw.wiki.deleteTiddler(t);
				});
				["$:/config/rimir/llm-connect/default-connection", "$:/state/rimir/llm-connect/settings-tab",
					"LlmChatTest"].forEach(function(t) { $tw.wiki.deleteTiddler(t); });
				const story = $tw.wiki.getTiddlerList("$:/StoryList").filter(function(t) {
					return t !== "$:/plugins/rimir/llm-connect/settings";
				});
				$tw.wiki.addTiddler({title: "$:/StoryList", text: "", list: $tw.utils.stringifyList(story)});
			});
			await page.waitForFunction(() => !$tw.syncer.isDirty());
		});

		async function openSettings(page) {
			await navigateToTiddler(page, SETTINGS);
			return page.locator('.tc-tiddler-frame[data-tiddler-title="' + SETTINGS + '"]');
		}

		async function openTab(frame, caption) {
			await frame.locator(".rr-settings-tabs-strip .rr-settings-tab").filter({ hasText: caption }).click();
			await expect(frame.locator(".rr-settings-tab-active")).toHaveText(caption);
		}

		test("tabs are Connections Routing Safety Files Prompt Tools in that order", async ({ page }) => {
			const frame = await openSettings(page);
			await expect(frame.locator(".rr-settings-tabs-strip .rr-settings-tab"))
				.toHaveText(["Connections", "Routing", "Safety", "Files", "Prompt", "Tools"]);
			await expect(frame.locator(".rr-settings-tab-active")).toHaveText("Connections");
		});

		test("Files tab short inputs are narrower than 150px", async ({ page }) => {
			const frame = await openSettings(page);
			await openTab(frame, "Files");
			const shorts = frame.locator(".rr-settings-tabs-body input.rr-config-input-short");
			const n = await shorts.count();
			expect(n).toBeGreaterThanOrEqual(3);
			for (let i = 0; i < n; i++) {
				const box = await shorts.nth(i).boundingBox();
				expect(box.width).toBeLessThan(150);
			}
			// in the story river the rows keep label and control side by side
			const sideBySide = await frame.locator(".rr-settings-tabs-body .rr-settings-row").first().evaluate(row => {
				const l = row.querySelector(".rr-settings-row-label").getBoundingClientRect();
				const c = row.querySelector(".rr-settings-row-control").getBoundingClientRect();
				return c.left >= l.right && Math.abs(c.top - l.top) < 20;
			});
			expect(sideBySide).toBe(true);
		});

		test("old settings sections are gone and every tab renders without errors", async ({ page }) => {
			const frame = await openSettings(page);
			for (const caption of ["Connections", "Routing", "Safety", "Files", "Prompt", "Tools"]) {
				await openTab(frame, caption);
				const body = frame.locator(".rr-settings-tabs-body");
				await expect(body).not.toContainText("Filter error");
				await expect(body).not.toContainText("\\procedure");
				await expect(body).not.toContainText("Default model");
			}
			await expect(frame.locator(".llm-default-model-provider-select")).toHaveCount(0);
		});

		test("add, configure, make default and delete a connection", async ({ page }) => {
			await page.evaluate(({CONN, CONN_TAG, KEYS}) => {
				$tw.wiki.addTiddler({title: CONN + "cloud", tags: CONN_TAG, "connection-id": "cloud", "connection-name": "Cloud",
					"connection-type": "claude", model: "claude-x"});
				$tw.wiki.addTiddler({title: KEYS + "cloud", text: "sk-test"});
				$tw.wiki.addTiddler({title: "$:/config/rimir/llm-connect/default-connection", text: "cloud"});
			}, {CONN, CONN_TAG, KEYS});
			const frame = await openSettings(page);
			const body = frame.locator(".rr-settings-tabs-body");
			await expect(body.locator('.llm-conn[data-connection="cloud"] .llm-conn-default')).toBeVisible();

			// add
			await body.locator(".llm-conn-add-btn").click();
			const typeSelect = body.locator("select.llm-conn-add-type");
			// listTypes order (by caption)
			const expectedTypes = await page.evaluate(() =>
				$tw.modules.execute("$:/plugins/rimir/llm-connect/connection-types").listTypes().map(t => t.caption));
			expect(expectedTypes).toEqual(expect.arrayContaining(["Azure OpenAI", "Claude", "OpenAI", "OpenAI-compatible"]));
			await expect(typeSelect.locator("option")).toHaveText(expectedTypes);
			await typeSelect.selectOption("openai-compatible");
			await body.locator("input.llm-conn-add-name").fill(NAME);
			await body.locator(".llm-conn-add-create").click();

			const id = await page.evaluate((CONN) => {
				return $tw.wiki.filterTiddlers("[all[tiddlers]prefix[" + CONN + "]]").map(t => t.substr(CONN.length)).filter(i => i !== "cloud")[0];
			}, CONN);
			expect(id).toMatch(/^c\d{17}$/);
			const row = body.locator('.llm-conn[data-connection="' + id + '"]');
			await expect(row.locator(".llm-conn-name")).toHaveText(NAME);
			await expect(row.locator(".llm-conn-type")).toHaveText("OpenAI-compatible");
			const stored = await page.evaluate(({CONN, id}) => $tw.wiki.getTiddler(CONN + id).fields, {CONN, id});
			// the id lives in the title only
			expect(stored["connection-id"]).toBeUndefined();
			expect(stored["connection-name"]).toBe(NAME);
			expect(stored["connection-type"]).toBe("openai-compatible");

			// editor is open; fields of the type in display order, key is a password input
			const editor = row.locator(".llm-conn-editor");
			await expect(editor).toBeVisible();
			await expect(editor.locator(".llm-conn-field")).toHaveText([/Endpoint/, /API key/, /Model/, /Max tokens/]);
			const keyInput = editor.locator('.llm-conn-field[data-field="api-key"] input');
			await expect(keyInput).toHaveAttribute("type", "password");
			await keyInput.fill("sk-local");
			await keyInput.dispatchEvent("change");
			expect(await page.evaluate(({KEYS, id}) => $tw.wiki.getTiddlerText(KEYS + id), {KEYS, id})).toBe("sk-local");

			// endpoint makes it configured → it appears in the chat dropdown
			expect(await page.evaluate((id) => $tw.modules.execute("$:/plugins/rimir/llm-connect/connections").isConfigured(id), id)).toBe(false);
			const endpoint = editor.locator('.llm-conn-field[data-field="endpoint"] input');
			await endpoint.fill("http://llm.mock/v1");
			await endpoint.dispatchEvent("change");
			expect(await page.evaluate((id) => $tw.modules.execute("$:/plugins/rimir/llm-connect/connections").isConfigured(id), id)).toBe(true);
			await page.evaluate((id) => {
				$tw.wiki.addTiddler({title: "$:/temp/rimir/llm-connect/models/" + id, type: "application/json",
					text: JSON.stringify([{id: "mock-a", label: "Mock A"}])});
				$tw.wiki.addTiddler({title: "$:/temp/rimir/llm-connect/models/cloud", type: "application/json",
					text: JSON.stringify([{id: "claude-x", label: "Claude X"}])});
			}, id);
			await createTiddlerInBrowser(page, "LlmChatTest", { text: '<$llm-chat/>' });
			await navigateToTiddler(page, "LlmChatTest");
			const chat = page.locator('.tc-tiddler-frame[data-tiddler-title="LlmChatTest"]');
			await chat.locator(".llm-model-selector-btn").click();
			await expect(chat.locator(".llm-model-selector-provider-header")).toHaveText(["Cloud", NAME]);
			await deleteTiddlerFromBrowser(page, "LlmChatTest");

			// with cached models the model field becomes a select
			await expect(editor.locator('.llm-conn-field[data-field="model"] select option[value="mock-a"]')).toHaveCount(1);

			// make default → badge moves
			await editor.locator(".llm-conn-make-default").click();
			await expect(row.locator(".llm-conn-default")).toBeVisible();
			await expect(body.locator('.llm-conn[data-connection="cloud"] .llm-conn-default')).toHaveCount(0);
			expect(await page.evaluate(() => $tw.wiki.getTiddlerText("$:/config/rimir/llm-connect/default-connection"))).toBe(id);

			// delete (two-step) → row, connection and key gone, default cleared
			await editor.locator(".llm-conn-delete").click();
			expect(await page.evaluate(({CONN, id}) => $tw.wiki.tiddlerExists(CONN + id), {CONN, id})).toBe(true);
			await editor.locator(".llm-conn-delete-confirm").click();
			await expect(row).toHaveCount(0);
			const after = await page.evaluate(({CONN, KEYS, id}) => ({
				conn: $tw.wiki.tiddlerExists(CONN + id),
				key: $tw.wiki.tiddlerExists(KEYS + id),
				def: $tw.wiki.tiddlerExists("$:/config/rimir/llm-connect/default-connection")
			}), {CONN, KEYS, id});
			expect(after).toEqual({conn: false, key: false, def: false});
			await expect(body.locator('.llm-conn[data-connection="cloud"]')).toHaveCount(1);
		});

		test("the first connection becomes the default; Make default shows while the default is not stored", async ({ page }) => {
			await page.evaluate(({CONN}) => {
				$tw.wiki.allTitles().filter(t => t.indexOf(CONN) === 0).forEach(t => $tw.wiki.deleteTiddler(t));
				$tw.wiki.deleteTiddler("$:/config/rimir/llm-connect/default-connection");
			}, {CONN});
			const frame = await openSettings(page);
			const body = frame.locator(".rr-settings-tabs-body");
			await body.locator(".llm-conn-add-btn").click();
			await body.locator("select.llm-conn-add-type").selectOption("claude");
			await body.locator("input.llm-conn-add-name").fill("First");
			await body.locator(".llm-conn-add-create").click();
			const id = await page.evaluate((CONN) =>
				$tw.wiki.filterTiddlers("[all[tiddlers]prefix[" + CONN + "]]").map(t => t.substr(CONN.length))[0], CONN);
			expect(await page.evaluate(() => $tw.wiki.getTiddlerText("$:/config/rimir/llm-connect/default-connection"))).toBe(id);
			const row = body.locator('.llm-conn[data-connection="' + id + '"]');
			await expect(row.locator(".llm-conn-default")).toBeVisible();
			await expect(row.locator(".llm-conn-make-default")).toHaveCount(0);

			// default only by fallback (nothing stored): badge stays, Make default is offered
			await page.evaluate(() => $tw.wiki.deleteTiddler("$:/config/rimir/llm-connect/default-connection"));
			await expect(row.locator(".llm-conn-default")).toBeVisible();
			await expect(row.locator(".llm-conn-make-default")).toBeVisible();
			await row.locator(".llm-conn-make-default").click();
			expect(await page.evaluate(() => $tw.wiki.getTiddlerText("$:/config/rimir/llm-connect/default-connection"))).toBe(id);
			await expect(row.locator(".llm-conn-make-default")).toHaveCount(0);
		});

		test("Routing lists each connection's cheap and expensive models", async ({ page }) => {
			await page.evaluate(({CONN, CONN_TAG}) => {
				$tw.wiki.addTiddler({title: CONN + "cloud", tags: CONN_TAG, "connection-id": "cloud", "connection-name": "Cloud",
					"connection-type": "claude", model: "claude-x", "cheap-model": "claude-haiku", "expensive-model": "claude-opus"});
			}, {CONN, CONN_TAG});
			const frame = await openSettings(page);
			await openTab(frame, "Routing");
			const body = frame.locator(".rr-settings-tabs-body");
			await expect(body.locator('input[type="checkbox"]')).toHaveCount(1);
			const tr = body.locator(".llm-routing-table tr").filter({ hasText: "Cloud" });
			await expect(tr).toContainText("claude-haiku");
			await expect(tr).toContainText("claude-opus");
		});

		test("settings rows fit the narrow ControlPanel column", async ({ page }) => {
			// 1100px: the TW sidebar is still shown, so the hub's content column is at its narrowest
			await page.setViewportSize({ width: 1100, height: 1000 });
			await page.evaluate(({CONN, CONN_TAG}) => {
				$tw.wiki.addTiddler({title: CONN + "narrow", tags: CONN_TAG, "connection-id": "narrow", "connection-name": "Narrow",
					"connection-type": "azure", model: "gpt-x"});
				$tw.wiki.addTiddler({title: "$:/state/rimir/llm-connect/connection-open/narrow", text: "open"});
			}, {CONN, CONN_TAG});
			await navigateToTiddler(page, "$:/ControlPanel");
			const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
			await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
			await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
			await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: /llm.connect/i }).click();
			const content = cp.locator(".rr-settings-content");

			async function rowProblems() {
				return content.locator(".rr-settings-tabs-body").evaluate(body => {
					const out = [];
					body.querySelectorAll(".rr-settings-row").forEach(row => {
						const r = row.getBoundingClientRect();
						const label = row.querySelector(":scope > .rr-settings-row-label").getBoundingClientRect();
						const control = row.querySelector(":scope > .rr-settings-row-control").getBoundingClientRect();
						const name = row.querySelector(":scope > .rr-settings-row-label").textContent;
						row.querySelectorAll(":scope > .rr-settings-row-control .rr-config-input-medium, :scope > .rr-settings-row-control .rr-config-input-short").forEach(el => {
							const b = el.getBoundingClientRect();
							const em = parseFloat(getComputedStyle(el).fontSize);
							const want = el.classList.contains("rr-config-input-short") ? 7 : 12;
							if (b.width > 0 && b.width < want * em) out.push(name + ": input squeezed to " + Math.round(b.width) + "px");
						});
						row.querySelectorAll(":scope > .rr-settings-row-control input, :scope > .rr-settings-row-control select").forEach(el => {
							const b = el.getBoundingClientRect();
							if (b.width > 0 && b.right > r.right + 0.5) out.push(name + ": control overflows row");
						});
						const overlap = label.width > 0 && control.width > 0 &&
							label.left < control.right && control.left < label.right &&
							label.top < control.bottom && control.top < label.bottom;
						if (overlap) out.push(name + ": label overlaps control");
					});
					return out;
				});
			}

			await expect(content.locator('.llm-conn[data-connection="narrow"] .llm-conn-editor')).toBeVisible();
			expect(await content.locator(".llm-conn-editor .rr-settings-row").count()).toBeGreaterThan(5);
			expect(await rowProblems()).toEqual([]);

			await content.locator(".rr-settings-tab").filter({ hasText: "Files" }).click();
			await expect(content.locator(".rr-settings-tab-active")).toHaveText("Files");
			expect(await content.locator(".rr-settings-tabs-body .rr-settings-row").count()).toBeGreaterThanOrEqual(5);
			expect(await rowProblems()).toEqual([]);

			await page.evaluate(() => {
				const story = $tw.wiki.getTiddlerList("$:/StoryList").filter(t => t !== "$:/ControlPanel");
				$tw.wiki.addTiddler({title: "$:/StoryList", text: "", list: $tw.utils.stringifyList(story)});
			});
		});

		test("tab strip in ControlPanel wraps instead of overflowing", async ({ page }) => {
			await page.setViewportSize({ width: 900, height: 900 });
			await navigateToTiddler(page, "$:/ControlPanel");
			const cp = page.locator('.tc-tiddler-frame[data-tiddler-title="$:/ControlPanel"]');
			await cp.locator("button, a").filter({ hasText: "Settings" }).first().click();
			await cp.locator("button, a").filter({ hasText: "Rimi Plugins" }).click();
			await cp.locator(".rr-settings-sidebar .rr-settings-plugin-item").filter({ hasText: /llm.connect/i }).click();
			const strip = cp.locator(".rr-settings-content .rr-settings-tabs-strip");
			await expect(strip.locator(".rr-settings-tab")).toHaveCount(6);
			const fits = await strip.evaluate(el => el.scrollWidth <= el.clientWidth + 1);
			expect(fits).toBe(true);
			await page.evaluate(() => {
				const story = $tw.wiki.getTiddlerList("$:/StoryList").filter(t => t !== "$:/ControlPanel");
				$tw.wiki.addTiddler({title: "$:/StoryList", text: "", list: $tw.utils.stringifyList(story)});
			});
		});
	});
});
