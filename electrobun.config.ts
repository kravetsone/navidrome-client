import type { ElectrobunConfig } from "electrobun";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
const version = process.env.APP_VERSION ?? pkg.version;
const signingEnabled = !!process.env.ELECTROBUN_DEVELOPER_ID;

export default {
	app: {
		name: "Navidrome Client",
		identifier: "io.github.kravetsone.navidrome-client",
		version,
	},
	build: {
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
			entitlements: "assets/entitlements.mac.plist",
			codesign: signingEnabled,
			notarize: signingEnabled,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
	updates: {
		provider: "generic",
		url: "https://github.com/kravetsone/navidrome-client/releases/latest/download",
	},
} satisfies ElectrobunConfig;
