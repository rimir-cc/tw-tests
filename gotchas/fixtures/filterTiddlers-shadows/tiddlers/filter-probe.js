/*\
title: $:/plugins/gotchas/filter-probe.js
type: application/javascript
module-type: startup

Runs two $tw.wiki.filterTiddlers calls and stashes the counts as fields on a probe tiddler.
\*/
"use strict";

exports.name = "gotcha-filter-shadows-probe";
exports.before = ["commands"];
exports.platforms = ["browser", "node"];
exports.synchronous = true;

exports.startup = function() {
    var shadowTag = "$:/tags/AdvancedSearch";
    var noPrefix = $tw.wiki.filterTiddlers("[tag[" + shadowTag + "]]");
    var withShadows = $tw.wiki.filterTiddlers("[all[tiddlers+shadows]tag[" + shadowTag + "]]");

    $tw.wiki.addTiddler(new $tw.Tiddler({
        title: "FilterProbeResults",
        noPrefixCount: String(noPrefix.length),
        noPrefixSample: noPrefix.slice(0,3).join(","),
        withShadowsCount: String(withShadows.length),
        withShadowsSample: withShadows.slice(0,3).join(",")
    }));
};
