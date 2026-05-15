/*\
title: $:/plugins/gotchas/test-deserializer.js
type: application/javascript
module-type: tiddlerdeserializer

Parses lines of `key=value` from the body into tiddler fields.
\*/
"use strict";

exports["application/x-test-kv"] = function(text, fields) {
    fields = fields || {};
    var result = {text: text};
    var lines = text.split("\n");
    var bodyLines = [];
    for(var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var m = /^([a-zA-Z][a-zA-Z0-9_-]*)=(.*)$/.exec(line);
        if(m) {
            result[m[1]] = m[2];
        } else if(line === "") {
            bodyLines = lines.slice(i + 1);
            break;
        }
    }
    result.text = bodyLines.join("\n");
    for(var k in fields) result[k] = fields[k];
    return [result];
};
