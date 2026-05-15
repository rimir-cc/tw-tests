/*\
title: $:/plugins/gotchas/perf-probe.js
type: application/javascript
module-type: startup

Probe $tw.perf state at two points in startup:
  - Before load-modules (very early)
  - Before legacy startup (= after load-modules in 5.4.0+)
\*/
"use strict";

exports.name = "gotcha-perf-probe-late";
exports.before = ["startup"];
exports.platforms = ["browser", "node"];
exports.synchronous = true;

exports.startup = function() {
    var atLate = {
        defined: typeof $tw.perf !== "undefined",
        constructorName: $tw.perf && $tw.perf.constructor && $tw.perf.constructor.name,
        hasLog: $tw.perf && typeof $tw.perf.log === "function"
    };
    var atLateEarlier = $tw.gotchaPerfEarly || {};

    $tw.wiki.addTiddler(new $tw.Tiddler({
        title: "PerfProbeResults",
        beforeLoadModules_defined: String(atLateEarlier.defined),
        beforeLoadModules_constructor: String(atLateEarlier.constructorName),
        beforeStartup_defined: String(atLate.defined),
        beforeStartup_constructor: String(atLate.constructorName),
        beforeStartup_hasLog: String(atLate.hasLog)
    }));
};
