import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const pkg = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };
const buildTime = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
let shortSha = "nogit";
try {
	shortSha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
		.toString()
		.trim();
} catch {}
let dirty = "";
try {
	const status = execSync("git status --porcelain", { stdio: ["ignore", "pipe", "ignore"] })
		.toString()
		.trim();
	if (status) dirty = "-dirty";
} catch {}
const buildId = `v${pkg.version}+${shortSha}${dirty}@${buildTime}`;

export default defineConfig({
	plugins: [solid()],
	root: "src/mainview",
	define: {
		__BUILD_ID__: JSON.stringify(buildId),
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
	},
	server: {
		port: 5173,
		strictPort: true,
	},
});
