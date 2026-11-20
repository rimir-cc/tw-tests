/*\
title: $:/plugins/rimir-test/outline-engine-probe/outline-engine-probe.js
type: application/javascript
module-type: startup

Test-only probe for the outline e2e spec: wraps SimpleEngine and FramedEngine handleInputEvent (the
hook point that editor plugins like AutoComplete patch) and counts the calls in window.__olEngineCalls.
Proves that the outline in-place editor runs on the core engines.

\*/
"use strict";

exports.name = "outline-engine-probe";
exports.platforms = ["browser"];
exports.after = ["startup"];
exports.synchronous = true;

exports.startup = function() {
	window.__olEngineCalls = 0;
	[
		require("$:/core/modules/editor/engines/simple.js").SimpleEngine,
		require("$:/core/modules/editor/engines/framed.js").FramedEngine
	].forEach(function(Engine) {
		var original = Engine.prototype.handleInputEvent;
		Engine.prototype.handleInputEvent = function() {
			window.__olEngineCalls++;
			return original.apply(this, arguments);
		};
	});
};
