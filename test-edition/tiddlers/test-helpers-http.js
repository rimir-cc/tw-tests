/*\
title: $:/test-helpers/http-server
type: application/javascript
module-type: library

HTTP test harness — spins up `$tw.Server` on a random ephemeral port for
route-handler tests. Promise-based; jasmine `beforeAll`/`afterAll` friendly.

Usage:

  var http = require("$:/test-helpers/http-server");

  describe("plugin: route X", function() {
    var ctx;
    beforeAll(function(done) {
      var wiki = new $tw.Wiki();
      wiki.addTiddlers([...]);
      http.start({wiki: wiki}).then(function(c) { ctx = c; done(); });
    });
    afterAll(function(done) { ctx.stop().then(done); });

    it("returns 200 on a valid GET", function(done) {
      http.request(ctx, "/api/things", {method: "GET"}).then(function(res) {
        expect(res.status).toBe(200);
        expect(res.json()).toEqual({...});
        done();
      });
    });
  });

API:

  start(options) → Promise<ctx>
    options.wiki      — required $tw.Wiki instance
    options.variables — optional hashmap merged into server.variables
    ctx.url           — base URL, e.g. "http://127.0.0.1:38291"
    ctx.host, ctx.port
    ctx.server        — the underlying $tw.Server
    ctx.listener      — the Node http.Server
    ctx.stop()        — Promise<void>, closes the listener

  request(ctx, pathOrUrl, options) → Promise<response>
    options.method   — default "GET"
    options.headers  — extra headers (object); Content-Type defaults to
                       application/json when body is a plain object
    options.body     — string, Buffer, or plain object (auto-JSON'd)
    response.status  — int
    response.headers — object
    response.body    — utf-8 string
    response.json()  — parsed JSON or null on parse failure

The harness lets Jasmine cover the route surfaces (file-upload, ext-connect,
runner, git-int, realms, frontmatter saver) that pure-JS tests cannot reach.

\*/

"use strict";

var http = require("http");
// `URL` (WHATWG) is a Node global but not available inside TW's vm sandbox,
// so require it explicitly from the url module.
var URL = require("url").URL;

function start(options) {
    var Server = require("$:/core/modules/server/server.js").Server;
    var server = new Server({
        wiki: options.wiki,
        variables: options.variables || {}
    });

    // Bypass Server.prototype.listen — its `port = port || this.get("port")`
    // turns our requested ephemeral port (0) into the default 8080, which
    // collides with other test runs. Build the Node server directly off
    // server.requestHandler instead.
    return new Promise(function(resolve, reject) {
        var listener = http.createServer(server.requestHandler.bind(server));
        listener.once("listening", function() {
            var addr = listener.address();
            resolve({
                wiki: options.wiki,
                server: server,
                listener: listener,
                host: addr.address,
                port: addr.port,
                url: "http://" + addr.address + ":" + addr.port,
                stop: function() {
                    return new Promise(function(res) {
                        listener.close(function() { res(); });
                    });
                }
            });
        });
        listener.once("error", reject);
        listener.listen(0, "127.0.0.1");
    });
}

function request(ctx, pathOrUrl, options) {
    options = options || {};
    var fullUrl = /^https?:/.test(pathOrUrl) ? pathOrUrl : (ctx.url + pathOrUrl);
    var u = new URL(fullUrl);

    var headers = {};
    for(var k in (options.headers || {})) { headers[k] = options.headers[k]; }

    var bodyBuf = null;
    if(options.body !== undefined && options.body !== null) {
        if(Buffer.isBuffer(options.body) || typeof options.body === "string") {
            bodyBuf = options.body;
        } else {
            bodyBuf = JSON.stringify(options.body);
            if(!headers["Content-Type"] && !headers["content-type"]) {
                headers["Content-Type"] = "application/json";
            }
        }
        if(!headers["Content-Length"] && !headers["content-length"]) {
            headers["Content-Length"] = Buffer.byteLength(bodyBuf);
        }
    }

    var reqOpts = {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + (u.search || ""),
        method: (options.method || "GET").toUpperCase(),
        headers: headers
    };

    return new Promise(function(resolve, reject) {
        var req = http.request(reqOpts, function(res) {
            var chunks = [];
            res.on("data", function(c) { chunks.push(c); });
            res.on("end", function() {
                var raw = Buffer.concat(chunks);
                var body = raw.toString("utf8");
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: body,
                    buffer: raw,
                    json: function() { try { return JSON.parse(body); } catch(_) { return null; } }
                });
            });
            res.on("error", reject);
        });
        req.on("error", reject);
        if(bodyBuf !== null) { req.write(bodyBuf); }
        req.end();
    });
}

exports.start = start;
exports.request = request;
