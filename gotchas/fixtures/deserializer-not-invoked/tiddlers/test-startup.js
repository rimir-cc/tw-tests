/*\
title: $:/plugins/gotchas/test-startup.js
type: application/javascript
module-type: startup

Creates two tiddlers with the same kv-payload body, one via plain addTiddler,
the other via deserializeTiddlers first.
\*/
"use strict";

exports.name = "gotcha-deserializer-probe";
exports.before = ["commands"];
exports.platforms = ["browser", "node"];
exports.synchronous = true;

exports.startup = function() {
    var payload = "alpha=ONE\nbeta=TWO\n\nbody content here\n";

    $tw.wiki.addTiddler(new $tw.Tiddler({
        title: "DirectAdd",
        type: "application/x-test-kv",
        text: payload
    }));

    var deserialized = $tw.wiki.deserializeTiddlers("application/x-test-kv", payload, {}) || [];
    var fields = deserialized[0] || {text: payload};
    fields.title = "ViaDeserialize";
    fields.type = "application/x-test-kv";
    $tw.wiki.addTiddler(new $tw.Tiddler(fields));
};
