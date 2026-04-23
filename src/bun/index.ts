import { BrowserView, BrowserWindow, Updater } from "electrobun/bun";
import { installApplicationMenu } from "./menu";
import { discordPresence } from "./discord-presence";
import type { AppRPCSchema } from "../shared/rpc-schema";
import type { PresencePayload } from "../shared/discord";

installApplicationMenu();

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			);
		}
	}
	return "views://mainview/index.html";
}

const url = await getMainViewUrl();

const rpc = BrowserView.defineRPC<AppRPCSchema>({
	handlers: {
		requests: {
			setDiscordPresence: (payload: PresencePayload) => {
				discordPresence.setActivity(payload);
			},
			clearDiscordPresence: () => {
				discordPresence.clear();
			},
		},
	},
});

const mainWindow = new BrowserWindow({
	title: "Navidrome",
	url,
	titleBarStyle: "hiddenInset",
	transparent: true,
	rpc,
	frame: {
		width: 1200,
		height: 780,
		x: 160,
		y: 120,
	},
});

discordPresence.start();

process.on("beforeExit", () => {
	discordPresence.stop();
});

console.log("Navidrome client started", mainWindow.id);
