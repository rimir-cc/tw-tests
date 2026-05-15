/*\
title: $:/plugins/gotchas/perf-probe-early.js
type: application/javascript
module-type: startup

Earliest possible startup observation point (before load-modules), records perf state on $tw.
\*/
"use strict";

exports.name = "gotcha-perf-probe-early";
exports.before = ["load-modules"];
exports.platforms = ["browser", "node"];
exports.synchronous = true;

exports.startup = function() {
    $tw.gotchaPerfEarly = {
        defined: typeof $tw.perf !== "undefined",
        constructorName: $tw.perf && $tw.perf.constructor && $tw.perf.constructor.name
    };
};
