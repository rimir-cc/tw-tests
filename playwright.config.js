const { defineConfig } = require("@playwright/test");
const path = require("path");

module.exports = defineConfig({
	testDir: "./tests/e2e",
	timeout: 30000,
	retries: 1,
	workers: 4,
	use: {
		baseURL: "http://localhost:9091",
		// fresh context per test — isolated localStorage
		storageState: undefined,
	},
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
	webServer: {
		command: "npx tiddlywiki pw-edition --listen port=9091 host=127.0.0.1",
		port: 9091,
		reuseExistingServer: false,
		timeout: 15000,
		env: {
			// Absolute path — see comment in testwiki.sh re path.resolve()
			// consistency for cross-tree refs in tiddlywiki.files specs.
			TIDDLYWIKI_PLUGIN_PATH: path.resolve(__dirname, "../dev-wiki/plugins"),
		},
	},
});
