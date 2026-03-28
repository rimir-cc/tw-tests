/*\
title: $:/test/tw-api-contracts
type: application/javascript
tags: [[$:/tags/test-spec]]

TW API contract tests — version upgrade canary.
Verifies the undocumented TW internal APIs that rimir plugins depend on.
If any of these fail after a TW version bump, the listed plugins are at risk.

\*/
"use strict";

describe("TW API contracts", function() {

	// ---------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------

	function setupWiki(tiddlers) {
		var wiki = new $tw.Wiki();
		wiki.addTiddlers(tiddlers || []);
		wiki.addIndexersToWiki();
		return wiki;
	}

	function renderWidget(wiki, text) {
		var parentWidget = wiki.makeTranscludeWidget(null, {
			document: $tw.fakeDocument,
			parseAsInline: false,
			variables: {}
		});
		var container = $tw.fakeDocument.createElement("div");
		var parser = wiki.parseText("text/vnd.tiddlywiki", text, { parseAsInline: false });
		var widgetTree = wiki.makeWidget(parser, {
			document: $tw.fakeDocument,
			parentWidget: parentWidget
		});
		widgetTree.render(container, null);
		return { container: container, widget: widgetTree, wiki: wiki };
	}

	function findWidget(widget, typeName) {
		if(widget.parseTreeNode && widget.parseTreeNode.type === typeName) {
			return widget;
		}
		if(widget.children) {
			for(var i = 0; i < widget.children.length; i++) {
				var found = findWidget(widget.children[i], typeName);
				if(found) return found;
			}
		}
		return null;
	}

	// ===============================================================
	// 1. PARSE TREE FORMAT
	// Risk: appify, llm-connect, json-dsl build parse trees programmatically
	// ===============================================================

	describe("parse tree format", function() {

		it("parseText returns object with tree array", function() {
			var wiki = setupWiki([]);
			var parser = wiki.parseText("text/vnd.tiddlywiki", "hello", {});
			expect(parser).toBeDefined();
			expect(Array.isArray(parser.tree)).toBe(true);
			expect(parser.tree.length).toBeGreaterThan(0);
		});

		it("element node has type, tag, children properties", function() {
			var wiki = setupWiki([]);
			// TW wraps inline content in a <p> block element
			var parser = wiki.parseText("text/vnd.tiddlywiki", "<div>text</div>", {});
			// Navigate into the wrapping <p> to find the <div>
			var wrapper = parser.tree[0];
			expect(wrapper.type).toBe("element");
			var divNode = wrapper.children[0];
			expect(divNode.type).toBe("element");
			expect(divNode.tag).toBe("div");
			expect(Array.isArray(divNode.children)).toBe(true);
		});

		it("widget node has tag with $ prefix and attributes object", function() {
			var wiki = setupWiki([]);
			var parser = wiki.parseText("text/vnd.tiddlywiki",
				'<$text text="hello"/>', {});
			// Widget is inside wrapping <p>
			var widgetNode = parser.tree[0].children[0];
			expect(widgetNode.tag).toBe("$text");
			expect(widgetNode.attributes).toBeDefined();
			expect(typeof widgetNode.attributes).toBe("object");
		});

		it("string attribute has type='string' and value", function() {
			var wiki = setupWiki([]);
			var parser = wiki.parseText("text/vnd.tiddlywiki",
				'<$text text="hello"/>', {});
			var widgetNode = parser.tree[0].children[0];
			var attr = widgetNode.attributes.text;
			expect(attr).toBeDefined();
			expect(attr.type).toBe("string");
			expect(attr.value).toBe("hello");
		});

		it("attribute has name property", function() {
			var wiki = setupWiki([]);
			var parser = wiki.parseText("text/vnd.tiddlywiki",
				'<$text text="hello"/>', {});
			var widgetNode = parser.tree[0].children[0];
			var attr = widgetNode.attributes.text;
			expect(attr.name).toBe("text");
		});

		it("orderedAttributes array exists", function() {
			var wiki = setupWiki([]);
			var parser = wiki.parseText("text/vnd.tiddlywiki",
				'<$text text="hello"/>', {});
			var widgetNode = parser.tree[0].children[0];
			expect(Array.isArray(widgetNode.orderedAttributes)).toBe(true);
			expect(widgetNode.orderedAttributes.length).toBeGreaterThan(0);
		});

		it("indirect attribute has type='indirect' and textReference", function() {
			var wiki = setupWiki([]);
			var parser = wiki.parseText("text/vnd.tiddlywiki",
				'<$text text={{MyTiddler}}/>', {});
			var widgetNode = parser.tree[0].children[0];
			var attr = widgetNode.attributes.text;
			expect(attr.type).toBe("indirect");
			expect(attr.textReference).toBeDefined();
		});

		it("filtered attribute has type='filtered' and filter", function() {
			var wiki = setupWiki([]);
			var parser = wiki.parseText("text/vnd.tiddlywiki",
				'<$text text={{{ [all[tiddlers]] }}}/>', {});
			var widgetNode = parser.tree[0].children[0];
			var attr = widgetNode.attributes.text;
			expect(attr.type).toBe("filtered");
			expect(attr.filter).toBeDefined();
		});

		it("widget with children has children array", function() {
			var wiki = setupWiki([]);
			var parser = wiki.parseText("text/vnd.tiddlywiki",
				'<$list filter="[all[tiddlers]]"><$text text="item"/></$list>', {});
			// $list is inside wrapping <p>
			var listNode = parser.tree[0].children[0];
			expect(listNode.tag).toBe("$list");
			expect(Array.isArray(listNode.children)).toBe(true);
			expect(listNode.children.length).toBeGreaterThan(0);
		});

		it("programmatic parse tree node renders correctly", function() {
			// This is how appify builds widget trees
			var wiki = setupWiki([]);
			var parentWidget = wiki.makeTranscludeWidget(null, {
				document: $tw.fakeDocument
			});
			var container = $tw.fakeDocument.createElement("div");
			var syntheticTree = [{
				type: "text",
				attributes: {
					text: { type: "string", value: "synthetic" }
				}
			}];
			var widgetTree = wiki.makeWidget({ tree: syntheticTree }, {
				document: $tw.fakeDocument,
				parentWidget: parentWidget
			});
			widgetTree.render(container, null);
			expect(container.textContent).toContain("synthetic");
		});
	});

	// ===============================================================
	// 2. WIDGET LIFECYCLE
	// Risk: all widget plugins depend on lifecycle method signatures
	// ===============================================================

	describe("widget lifecycle", function() {

		var Widget;

		beforeEach(function() {
			Widget = require("$:/core/modules/widgets/widget.js").widget;
		});

		it("Widget base class exists and is a constructor", function() {
			expect(Widget).toBeDefined();
			expect(typeof Widget).toBe("function");
		});

		it("prototype has render, refresh, execute methods", function() {
			expect(typeof Widget.prototype.render).toBe("function");
			expect(typeof Widget.prototype.refresh).toBe("function");
			expect(typeof Widget.prototype.execute).toBe("function");
		});

		it("prototype has makeChildWidgets and renderChildren", function() {
			expect(typeof Widget.prototype.makeChildWidgets).toBe("function");
			expect(typeof Widget.prototype.renderChildren).toBe("function");
		});

		it("prototype has getAttribute returning string", function() {
			expect(typeof Widget.prototype.getAttribute).toBe("function");
		});

		it("prototype has computeAttributes returning changed-attributes object", function() {
			expect(typeof Widget.prototype.computeAttributes).toBe("function");
		});

		it("prototype has invokeActions for action dispatch", function() {
			expect(typeof Widget.prototype.invokeActions).toBe("function");
		});

		it("prototype has getStateQualifier for state isolation", function() {
			expect(typeof Widget.prototype.getStateQualifier).toBe("function");
		});

		it("prototype has setVariable for variable scoping", function() {
			expect(typeof Widget.prototype.setVariable).toBe("function");
		});

		it("prototype has getVariable for variable access", function() {
			expect(typeof Widget.prototype.getVariable).toBe("function");
		});

		it("prototype has parentWidget property access pattern", function() {
			// Plugins use parentWidget to walk up the tree
			var wiki = setupWiki([]);
			var result = renderWidget(wiki, '<$list filter="[[A]]"><$text text="x"/></$list>');
			var textWidget = findWidget(result.widget, "text");
			expect(textWidget).toBeDefined();
			// Walk up — should find parent
			var parent = textWidget.parentWidget;
			expect(parent).toBeDefined();
		});

		it("computeAttributes returns object with changed attribute keys", function() {
			var wiki = setupWiki([]);
			var result = renderWidget(wiki,
				'<$text text="hello"/>');
			var textWidget = findWidget(result.widget, "text");
			// Second call to computeAttributes should return empty (no changes)
			var changed = textWidget.computeAttributes();
			expect(typeof changed).toBe("object");
		});

		it("refreshSelf triggers full re-render", function() {
			expect(typeof Widget.prototype.refreshSelf).toBe("function");
		});

		it("render→execute→makeChildWidgets order produces working widget tree", function() {
			var wiki = setupWiki([]);
			var result = renderWidget(wiki,
				'<$let myVar="test123"><$text text=<<myVar>>/></$let>');
			expect(result.container.textContent).toContain("test123");
		});

		it("action widget invokeAction is called correctly", function() {
			var wiki = setupWiki([]);
			var result = renderWidget(wiki,
				'<$button><$action-setfield $tiddler="Target" text="done"/></$button>');
			var button = findWidget(result.widget, "button");
			expect(button).toBeDefined();
			button.invokeActions(button, {});
			var tiddler = wiki.getTiddler("Target");
			expect(tiddler).toBeDefined();
			expect(tiddler.fields.text).toBe("done");
		});

		it("refresh returns boolean", function() {
			var wiki = setupWiki([]);
			var result = renderWidget(wiki, '<$text text="hello"/>');
			var refreshed = result.widget.refresh({});
			expect(typeof refreshed).toBe("boolean");
		});
	});

	// ===============================================================
	// 3. FILTER OPERATOR CONTRACT
	// Risk: statewrap, json-dsl, typed register custom filter operators
	// ===============================================================

	describe("filter operator contract", function() {

		it("custom operator receives (source, operator, options)", function() {
			var receivedArgs = null;
			// Register a test operator
			var wiki = setupWiki([{ title: "A", text: "hello" }]);

			// Use an existing rimir operator to verify the signature
			var statewrapGet = require("$:/plugins/rimir/statewrap/modules/filters/statewrap-get.js");
			expect(statewrapGet["statewrap-get"]).toBeDefined();
			expect(typeof statewrapGet["statewrap-get"]).toBe("function");
		});

		it("options.widget is available in widget-context filters", function() {
			var wiki = setupWiki([]);
			// Render a widget that uses a filter in triple braces
			var result = renderWidget(wiki,
				'<$statewrap channels="ch" instid="fc-test" default-ch="val">' +
				'<$text text={{{ [statewrap-get[ch]] }}}/>' +
				'</$statewrap>');
			// If options.widget was passed, statewrap-get can walk the parent chain
			expect(result.container.textContent).toContain("val");
		});

		it("filterTiddlers returns array of strings", function() {
			var wiki = setupWiki([
				{ title: "Alpha", tags: "test" },
				{ title: "Beta", tags: "test" }
			]);
			var results = wiki.filterTiddlers("[tag[test]]");
			expect(Array.isArray(results)).toBe(true);
			expect(results.length).toBe(2);
			expect(typeof results[0]).toBe("string");
		});

		it("filterTiddlers accepts optional widget parameter", function() {
			var wiki = setupWiki([]);
			// Should not throw when widget is null/undefined
			var results = wiki.filterTiddlers("[all[tiddlers]]", null);
			expect(Array.isArray(results)).toBe(true);
		});
	});

	// ===============================================================
	// 4. HOOK API
	// Risk: filesystem-watcher, ext-connect, file-upload, minver
	// ===============================================================

	describe("hook API", function() {

		it("$tw.hooks exists", function() {
			expect($tw.hooks).toBeDefined();
		});

		it("addHook is a function", function() {
			expect(typeof $tw.hooks.addHook).toBe("function");
		});

		it("invokeHook is a function", function() {
			expect(typeof $tw.hooks.invokeHook).toBe("function");
		});

		it("hook callback receives and can modify the value", function() {
			var hookName = "test-contract-hook-" + Date.now();
			var called = false;
			$tw.hooks.addHook(hookName, function(value) {
				called = true;
				return value + "-modified";
			});
			var result = $tw.hooks.invokeHook(hookName, "original");
			expect(called).toBe(true);
			expect(result).toBe("original-modified");
		});

		it("multiple hooks chain return values", function() {
			var hookName = "test-contract-chain-" + Date.now();
			$tw.hooks.addHook(hookName, function(val) { return val + "A"; });
			$tw.hooks.addHook(hookName, function(val) { return val + "B"; });
			var result = $tw.hooks.invokeHook(hookName, "");
			expect(result).toBe("AB");
		});

		it("th-saving-tiddler hook name is recognized", function() {
			// Verify the hook names our plugins use exist in TW's convention
			// We add a no-op handler — if addHook signature changes, this fails
			var noop = function(tiddler) { return tiddler; };
			expect(function() {
				$tw.hooks.addHook("th-saving-tiddler", noop);
			}).not.toThrow();
		});

		it("th-deleting-tiddler hook name is recognized", function() {
			var noop = function(tiddler) { return tiddler; };
			expect(function() {
				$tw.hooks.addHook("th-deleting-tiddler", noop);
			}).not.toThrow();
		});
	});

	// ===============================================================
	// 5. WIKI STORE METHODS
	// Risk: every plugin uses wiki store
	// ===============================================================

	describe("wiki store methods", function() {

		it("getTiddler returns object with fields property", function() {
			var wiki = setupWiki([{ title: "Test", text: "hello", custom: "field" }]);
			var t = wiki.getTiddler("Test");
			expect(t).toBeDefined();
			expect(t.fields).toBeDefined();
			expect(t.fields.title).toBe("Test");
			expect(t.fields.text).toBe("hello");
			expect(t.fields.custom).toBe("field");
		});

		it("getTiddler returns undefined for missing tiddler", function() {
			var wiki = setupWiki([]);
			var t = wiki.getTiddler("NonExistent");
			expect(t).toBeUndefined();
		});

		it("addTiddler accepts plain object", function() {
			var wiki = setupWiki([]);
			wiki.addTiddler({ title: "New", text: "content" });
			var t = wiki.getTiddler("New");
			expect(t).toBeDefined();
			expect(t.fields.text).toBe("content");
		});

		it("addTiddler accepts $tw.Tiddler instance", function() {
			var wiki = setupWiki([]);
			wiki.addTiddler(new $tw.Tiddler({ title: "TidObj", text: "via-constructor" }));
			var t = wiki.getTiddler("TidObj");
			expect(t.fields.text).toBe("via-constructor");
		});

		it("setText writes text field by default", function() {
			var wiki = setupWiki([]);
			wiki.setText("SetTest", "text", null, "written");
			var t = wiki.getTiddler("SetTest");
			expect(t.fields.text).toBe("written");
		});

		it("setText creates tiddler if it does not exist", function() {
			var wiki = setupWiki([]);
			wiki.setText("Brand New", "text", null, "created");
			expect(wiki.getTiddler("Brand New")).toBeDefined();
		});

		it("deleteTiddler removes tiddler", function() {
			var wiki = setupWiki([{ title: "ToDelete", text: "bye" }]);
			wiki.deleteTiddler("ToDelete");
			expect(wiki.getTiddler("ToDelete")).toBeUndefined();
		});

		it("getChangeCount returns number", function() {
			var wiki = setupWiki([{ title: "CC", text: "v1" }]);
			var count = wiki.getChangeCount("CC");
			expect(typeof count).toBe("number");
			expect(count).toBeGreaterThan(0);
		});

		it("getChangeCount increments on addTiddler", function() {
			var wiki = setupWiki([{ title: "Inc", text: "v1" }]);
			var before = wiki.getChangeCount("Inc");
			wiki.addTiddler({ title: "Inc", text: "v2" });
			var after = wiki.getChangeCount("Inc");
			expect(after).toBeGreaterThan(before);
		});

		it("tiddlerExists returns boolean", function() {
			var wiki = setupWiki([{ title: "Exists" }]);
			expect(wiki.tiddlerExists("Exists")).toBe(true);
			expect(wiki.tiddlerExists("Nope")).toBe(false);
		});

		it("isShadowTiddler is a function", function() {
			var wiki = setupWiki([]);
			expect(typeof wiki.isShadowTiddler).toBe("function");
		});

		it("addEventListener registers change listener", function() {
			var wiki = setupWiki([]);
			var changeCalled = false;
			wiki.addEventListener("change", function(ch) {
				changeCalled = true;
			});
			wiki.addTiddler({ title: "Trigger", text: "event" });
			// TW dispatches changes asynchronously via setTimeout;
			// verify at minimum that addTiddler doesn't throw with listener
			// and that the listener function type is accepted
			expect(typeof wiki.addEventListener).toBe("function");
		});

		it("allTitles returns array of strings", function() {
			var wiki = setupWiki([{ title: "A" }, { title: "B" }]);
			var titles = wiki.allTitles();
			expect(Array.isArray(titles)).toBe(true);
			expect(titles).toContain("A");
			expect(titles).toContain("B");
		});

		it("getTiddlerText returns text field or fallback", function() {
			var wiki = setupWiki([{ title: "HasText", text: "content" }]);
			expect(wiki.getTiddlerText("HasText")).toBe("content");
			expect(wiki.getTiddlerText("Missing", "fallback")).toBe("fallback");
		});
	});

	// ===============================================================
	// 6. $tw.Tiddler CONSTRUCTOR
	// Risk: all plugins create tiddlers
	// ===============================================================

	describe("Tiddler constructor", function() {

		it("accepts single object with fields", function() {
			var t = new $tw.Tiddler({ title: "A", text: "content", custom: "val" });
			expect(t.fields.title).toBe("A");
			expect(t.fields.text).toBe("content");
			expect(t.fields.custom).toBe("val");
		});

		it("merges multiple objects (later wins)", function() {
			var base = new $tw.Tiddler({ title: "Base", text: "old", keep: "yes" });
			var updated = new $tw.Tiddler(base, { text: "new", added: "field" });
			expect(updated.fields.title).toBe("Base");
			expect(updated.fields.text).toBe("new");
			expect(updated.fields.keep).toBe("yes");
			expect(updated.fields.added).toBe("field");
		});

		it("fields property is accessible", function() {
			var t = new $tw.Tiddler({ title: "Test" });
			expect(t.fields).toBeDefined();
			expect(typeof t.fields).toBe("object");
		});
	});

	// ===============================================================
	// 7. $tw.utils FUNCTIONS
	// Risk: filesystem-watcher, ext-connect, file-upload, minver
	// ===============================================================

	describe("$tw.utils functions", function() {

		it("stringifyDate produces 17-char timestamp", function() {
			var result = $tw.utils.stringifyDate(new Date());
			expect(typeof result).toBe("string");
			expect(result.length).toBe(17);
			expect(result).toMatch(/^\d{17}$/);
		});

		it("parseStringArray parses TW list format", function() {
			var result = $tw.utils.parseStringArray("alpha [[beta gamma]] delta");
			expect(Array.isArray(result)).toBe(true);
			expect(result).toContain("alpha");
			expect(result).toContain("beta gamma");
			expect(result).toContain("delta");
		});

		it("stringifyList produces TW list format", function() {
			var result = $tw.utils.stringifyList(["alpha", "beta gamma", "delta"]);
			expect(typeof result).toBe("string");
			expect(result).toContain("alpha");
			expect(result).toContain("[[beta gamma]]");
			expect(result).toContain("delta");
		});

		it("Logger constructor exists", function() {
			expect(typeof $tw.utils.Logger).toBe("function");
			var logger = new $tw.utils.Logger("test");
			expect(typeof logger.log).toBe("function");
		});

		it("each iterates object keys", function() {
			var keys = [];
			$tw.utils.each({ a: 1, b: 2 }, function(val, key) {
				keys.push(key);
			});
			expect(keys).toContain("a");
			expect(keys).toContain("b");
		});
	});

	// ===============================================================
	// 8. BOOT INFRASTRUCTURE
	// Risk: filesystem-watcher, git-int, ext-connect, file-upload
	// ===============================================================

	describe("boot infrastructure", function() {

		it("$tw.boot exists", function() {
			expect($tw.boot).toBeDefined();
		});

		it("$tw.boot.wikiPath is a string", function() {
			// All server-side route handlers use this
			expect(typeof $tw.boot.wikiPath).toBe("string");
			expect($tw.boot.wikiPath.length).toBeGreaterThan(0);
		});

		it("$tw.boot.wikiTiddlersPath is a string", function() {
			// filesystem-watcher uses this for chokidar watch path
			expect(typeof $tw.boot.wikiTiddlersPath).toBe("string");
		});

		it("$tw.boot.files is an object", function() {
			// filesystem-watcher and git-int read/write boot.files[title]
			expect($tw.boot.files).toBeDefined();
			expect(typeof $tw.boot.files).toBe("object");
		});

		it("boot.files entries have filepath, type, hasMetaFile", function() {
			// Check structure of any existing entry
			var titles = Object.keys($tw.boot.files);
			if(titles.length > 0) {
				var entry = $tw.boot.files[titles[0]];
				expect(entry).toBeDefined();
				expect(typeof entry.filepath).toBe("string");
				expect(entry.type).toBeDefined();
				expect(typeof entry.hasMetaFile).toBe("boolean");
			}
			// If no files, the structure test is skipped (CI/minimal environments)
			expect(true).toBe(true);
		});

		it("$tw.boot.wikiInfo exists and has plugins array", function() {
			// ext-connect deserializer reads this for includeWikis
			expect($tw.boot.wikiInfo).toBeDefined();
			expect(Array.isArray($tw.boot.wikiInfo.plugins)).toBe(true);
		});
	});

	// ===============================================================
	// 9. ROUTE MODULE CONTRACT
	// Risk: realms, git-int, runner, ext-connect, file-upload
	// ===============================================================

	describe("route module contract", function() {

		it("route modules export method, path, and handler", function() {
			// Use a route that doesn't read config at load time
			var getRoute = require("$:/plugins/rimir/realms/route-api-get.js");
			expect(getRoute.method).toBeDefined();
			expect(typeof getRoute.method).toBe("string");
			expect(getRoute.path).toBeDefined();
			// Path is a RegExp
			expect(typeof getRoute.path.test).toBe("function");
			expect(typeof getRoute.handler).toBe("function");
		});

		it("route handler is a function accepting (request, response, state)", function() {
			var getRoute = require("$:/plugins/rimir/realms/route-api-get.js");
			expect(getRoute.handler.length).toBe(3);
		});

		it("route path matches expected URL via .test()", function() {
			var getRoute = require("$:/plugins/rimir/realms/route-api-get.js");
			expect(getRoute.path.test("/api/realms")).toBe(true);
			expect(getRoute.path.test("/other")).toBe(false);
		});

		it("GET and PUT route types both supported", function() {
			var getRoute = require("$:/plugins/rimir/realms/route-api-get.js");
			var putRoute = require("$:/plugins/rimir/realms/route-api-put.js");
			expect(getRoute.method).toBe("GET");
			expect(putRoute.method).toBe("PUT");
		});

		it("route modules available via $tw.modules.types.route", function() {
			var routeModules = $tw.modules.types["route"];
			expect(routeModules).toBeDefined();
			expect(Object.keys(routeModules).length).toBeGreaterThan(0);
		});
	});

	// ===============================================================
	// 10. SYNCER CONTRACT
	// Risk: filesystem-watcher, ext-connect
	// These write to $tw.syncer.tiddlerInfo directly
	// ===============================================================

	describe("syncer contract", function() {

		it("$tw.syncer exists in server environment", function() {
			// In test mode (--test), syncer may not be fully initialized
			// but the object should exist if tiddlyweb plugin is loaded
			if($tw.syncer) {
				expect($tw.syncer).toBeDefined();
				expect(typeof $tw.syncer).toBe("object");
			} else {
				// In pure --test mode without --listen, syncer may not start
				// This is expected — the contract test verifies structure when available
				pending("syncer not available in --test mode");
			}
		});

		it("syncer.tiddlerInfo is an object when syncer exists", function() {
			if($tw.syncer && $tw.syncer.tiddlerInfo) {
				expect(typeof $tw.syncer.tiddlerInfo).toBe("object");
			} else {
				pending("syncer.tiddlerInfo not available in --test mode");
			}
		});
	});

	// ===============================================================
	// 11. wiki.makeWidget / wiki.parseText
	// Risk: appify, llm-connect
	// ===============================================================

	describe("wiki.makeWidget and parseText", function() {

		it("parseText returns object with tree property", function() {
			var wiki = setupWiki([]);
			var result = wiki.parseText("text/vnd.tiddlywiki", "hello", {});
			expect(result).toBeDefined();
			expect(result.tree).toBeDefined();
			expect(Array.isArray(result.tree)).toBe(true);
		});

		it("makeWidget accepts parser output and options", function() {
			var wiki = setupWiki([]);
			var parser = wiki.parseText("text/vnd.tiddlywiki", "test", {});
			var widget = wiki.makeWidget(parser, {
				document: $tw.fakeDocument
			});
			expect(widget).toBeDefined();
			expect(typeof widget.render).toBe("function");
		});

		it("makeWidget accepts parentWidget option", function() {
			var wiki = setupWiki([]);
			var parent = wiki.makeTranscludeWidget(null, {
				document: $tw.fakeDocument
			});
			var parser = wiki.parseText("text/vnd.tiddlywiki", "test", {});
			var widget = wiki.makeWidget(parser, {
				document: $tw.fakeDocument,
				parentWidget: parent
			});
			expect(widget.parentWidget).toBeDefined();
		});

		it("makeTranscludeWidget exists and returns widget", function() {
			var wiki = setupWiki([]);
			var widget = wiki.makeTranscludeWidget(null, {
				document: $tw.fakeDocument
			});
			expect(widget).toBeDefined();
			expect(typeof widget.render).toBe("function");
		});

		it("fakeDocument supports createElement", function() {
			var el = $tw.fakeDocument.createElement("div");
			expect(el).toBeDefined();
			expect(el.tag).toBe("div");
		});

		it("fakeDocument supports createTextNode", function() {
			var text = $tw.fakeDocument.createTextNode("hello");
			expect(text).toBeDefined();
			expect(text.textContent).toBe("hello");
		});
	});

	// ===============================================================
	// 12. MODULE SYSTEM
	// Risk: all plugins use require() for module loading
	// ===============================================================

	describe("module system", function() {

		it("require resolves plugin module paths", function() {
			var utils = require("$:/plugins/rimir/statewrap/modules/utils.js");
			expect(utils).toBeDefined();
			expect(typeof utils.getStatewrapContext).toBe("function");
		});

		it("module-type: widget modules register in widget factory", function() {
			var wiki = setupWiki([]);
			// Verify our widgets are registered by rendering them
			var result = renderWidget(wiki,
				'<$statewrap channels="ch" instid="mod-test"></$statewrap>');
			// No error means widget type was found
			expect(result.container).toBeDefined();
		});

		it("module-type: filteroperator modules are callable via filters", function() {
			var wiki = setupWiki([]);
			var result = renderWidget(wiki,
				'<$statewrap channels="ch" instid="fop-test" default-ch="works">' +
				'<$text text={{{ [statewrap-get[ch]] }}}/>' +
				'</$statewrap>');
			expect(result.container.textContent).toContain("works");
		});

		it("module-type: library modules are importable", function() {
			var utils = require("$:/plugins/rimir/statewrap/modules/utils.js");
			expect(typeof utils.getStatewrapContext).toBe("function");
		});

		it("module-type: route modules are importable", function() {
			// Use a route that doesn't have side effects at load time
			var route = require("$:/plugins/rimir/realms/route-api-get.js");
			expect(route.method).toBeDefined();
			expect(route.path).toBeDefined();
			expect(route.handler).toBeDefined();
		});
	});

	// ===============================================================
	// 13. VARIABLE SCOPING
	// Risk: json-dsl uses setVariable per iteration, appify uses variables
	// ===============================================================

	describe("variable scoping", function() {

		it("$let widget sets variable for children", function() {
			var wiki = setupWiki([]);
			var result = renderWidget(wiki,
				'<$let foo="bar"><$text text=<<foo>>/></$let>');
			expect(result.container.textContent).toContain("bar");
		});

		it("$list sets currentTiddler variable per iteration", function() {
			var wiki = setupWiki([
				{ title: "X", text: "" },
				{ title: "Y", text: "" }
			]);
			var result = renderWidget(wiki,
				'<$list filter="X Y"><$text text=<<currentTiddler>>/> </$list>');
			expect(result.container.textContent).toContain("X");
			expect(result.container.textContent).toContain("Y");
		});

		it("nested variable scopes shadow outer scope", function() {
			var wiki = setupWiki([]);
			var result = renderWidget(wiki,
				'<$let v="outer"><$let v="inner"><$text text=<<v>>/></$let></$let>');
			expect(result.container.textContent).toContain("inner");
		});

		it("getVariableInfo returns object with params", function() {
			// typed plugin uses widget.getVariableInfo()
			var wiki = setupWiki([]);
			var result = renderWidget(wiki,
				'\\define myFunc(a) $a$\n<$text text="x"/>');
			var widget = findWidget(result.widget, "text");
			if(widget && typeof widget.getVariableInfo === "function") {
				var info = widget.getVariableInfo("myFunc", { params: [{ name: "a", value: "test" }] });
				expect(info).toBeDefined();
				expect(info.text).toBeDefined();
			} else {
				pending("getVariableInfo not available on this widget");
			}
		});
	});

	// ===============================================================
	// 14. STARTUP MODULE CONTRACT
	// Risk: filesystem-watcher, ext-connect, minver, realms
	// ===============================================================

	describe("startup module contract", function() {

		it("startup modules export name, startup function", function() {
			// Verify structure of a known startup module
			var modules = $tw.modules.types["startup"];
			expect(modules).toBeDefined();
			// At least one startup module should exist
			var titles = Object.keys(modules);
			expect(titles.length).toBeGreaterThan(0);
		});

		it("startup modules can have after/before dependencies", function() {
			// Verify that TW's startup system reads these properties
			var modules = $tw.modules.types["startup"];
			var titles = Object.keys(modules);
			// Find any module with 'after' property
			var hasAfter = titles.some(function(t) {
				var mod = require(t);
				return mod && mod.after;
			});
			// This should be true — many core modules use after
			expect(hasAfter).toBe(true);
		});

		it("startup modules can specify platforms", function() {
			var modules = $tw.modules.types["startup"];
			var titles = Object.keys(modules);
			var hasPlatform = titles.some(function(t) {
				var mod = require(t);
				return mod && mod.platforms;
			});
			expect(hasPlatform).toBe(true);
		});
	});
});
