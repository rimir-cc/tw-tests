/*\
title: $:/test-helpers/jasmine-seed
type: application/javascript
tags: [[$:/tags/test-spec]]

Replays a spec order. TW's `--test` command only takes `spec=`, so testwiki.sh passes `--seed <n>` as the
environment variable JASMINE_SEED. Test-spec modules are evaluated before Jasmine executes, so configuring the
seed here sets the order of the run ("Randomized with seed <n>" in the output).

\*/
"use strict";

var seed = typeof process !== "undefined" && process.env ? process.env.JASMINE_SEED : "";
if(seed) {
	jasmine.getEnv().configure({random: true, seed: String(seed)});
}
