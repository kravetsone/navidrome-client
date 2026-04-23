import type { ElectrobunConfig } from "electrobun";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));
const version = process.env.APP_VERSION ?? pkg.version;
const signingEnabled = !!process.env.ELECTROBUN_DEVELOPER_ID;

// Auto-updater endpoint baked into the built app as `release.baseUrl` inside
// version.json. Override via ELECTROBUN_BASE_URL for local updater testing
// (see scripts/test-updater.ts). The default points at GitHub Releases —
// note that GitHub only serves `/latest/download/` for non-draft releases,
// so the release workflow must flip `draft: false` for this to resolve.
const baseUrl =
	process.env.ELECTROBUN_BASE_URL ??
	"https://github.com/kravetsone/navidrome-client/releases/latest/download";

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
	release: {
		baseUrl,
		// Delta patches diff against the previous release via `fetch(baseUrl/…)`
		// at build time — disable for local runs where we don't have a
		// preceding release published.
		generatePatch: !!process.env.ELECTROBUN_BASE_URL ? false : true,
	},
} satisfies ElectrobunConfig;
