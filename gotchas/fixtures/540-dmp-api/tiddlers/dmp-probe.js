/*\
title: $:/plugins/gotchas/dmp-probe.js
type: application/javascript
module-type: startup

Probes the diff-match-patch module API surface for old (class) vs new (flat functions) shape.
\*/
"use strict";

exports.name = "gotcha-dmp-probe";
exports.before = ["commands"];
exports.platforms = ["browser", "node"];
exports.synchronous = true;

exports.startup = function() {
    var dmp = require("$:/core/modules/utils/diff-match-patch/diff_match_patch.js");

    var hasFlatDiffMain = typeof dmp.diffMain === "function";
    var hasFlatPatchMake = typeof dmp.patchMake === "function";
    var hasFlatMatch = typeof dmp.matchMain === "function";
    var hasOldClass = typeof dmp.diff_match_patch === "function";

    var oldStyleWorks = "no";
    try {
        var d = new dmp.diff_match_patch();
        var r = d.diff_main("foo", "bar");
        oldStyleWorks = r ? "yes" : "no-result";
    } catch(e) {
        oldStyleWorks = "throws:" + (e.message || e).toString().slice(0, 60);
    }

    var flatStyleWorks = "no";
    try {
        var r2 = dmp.diffMain("foo", "bar");
        flatStyleWorks = r2 && r2.length > 0 ? "yes" : "no-result";
    } catch(e) {
        flatStyleWorks = "throws:" + (e.message || e).toString().slice(0, 60);
    }

    $tw.wiki.addTiddler(new $tw.Tiddler({
        title: "DmpProbeResults",
        hasFlatDiffMain: String(hasFlatDiffMain),
        hasFlatPatchMake: String(hasFlatPatchMake),
        hasFlatMatch: String(hasFlatMatch),
        hasOldClass: String(hasOldClass),
        oldStyleWorks: oldStyleWorks,
        flatStyleWorks: flatStyleWorks
    }));
};
