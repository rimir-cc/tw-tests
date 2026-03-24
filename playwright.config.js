const { defineConfig } = require("@playwright/test");

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
			TIDDLYWIKI_PLUGIN_PATH: "../dev-wiki/plugins",
		},
	},
});
