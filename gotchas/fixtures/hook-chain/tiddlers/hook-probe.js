/*\
title: $:/plugins/gotchas/hook-probe.js
type: application/javascript
module-type: startup

Register two hooks under one name. The first one forgets to return (returns undefined).
Then register two hooks under another name where both return correctly.
Invoke each chain and stash the observed value at hook B.
\*/
"use strict";

exports.name = "gotcha-hook-probe";
exports.before = ["commands"];
exports.platforms = ["browser", "node"];
exports.synchronous = true;

exports.startup = function() {
    var brokenSecondSaw = "NOT_INVOKED";
    var workingSecondSaw = "NOT_INVOKED";

    // Broken chain
    $tw.hooks.addHook("th-probe-broken", function(value) {
        // Note: no return statement
    });
    $tw.hooks.addHook("th-probe-broken", function(value) {
        brokenSecondSaw = String(value);
        return value;
    });

    // Working chain
    $tw.hooks.addHook("th-probe-working", function(value) {
        return value + "-A";
    });
    $tw.hooks.addHook("th-probe-working", function(value) {
        workingSecondSaw = String(value);
        return value + "-B";
    });

    var brokenResult = $tw.hooks.invokeHook("th-probe-broken", "INPUT");
    var workingResult = $tw.hooks.invokeHook("th-probe-working", "INPUT");

    $tw.wiki.addTiddler(new $tw.Tiddler({
        title: "HookProbeResults",
        brokenSecondSaw: brokenSecondSaw,
        brokenResult: String(brokenResult),
        workingSecondSaw: workingSecondSaw,
        workingResult: String(workingResult)
    }));
};
