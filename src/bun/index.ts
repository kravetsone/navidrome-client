import { BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { spawn } from "bun";
import { installApplicationMenu } from "./menu";
import { discordPresence } from "./discord-presence";
import { persistence } from "./db";
import {
	disposeIntegrations,
	installGlobalShortcuts,
	installTray,
	setNowPlayingMeta,
} from "./tray";
import {
	applyUpdateNow,
	checkNow as checkForUpdateNow,
	disposeUpdater,
	getUpdaterState,
	initUpdater,
} from "./updater";
import type {
	AppRPCSchema,
	DiscordRuntimePrefs,
	NowPlayingMeta,
} from "../shared/rpc-schema";
import type { PresencePayload } from "../shared/discord";
import { HISTORY_LIMIT } from "../shared/persistence";

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
			persistenceSnapshot: () => ({
				kv: persistence.kvGetAll(),
				servers: persistence.serversList().map((r) => r.data),
				history: persistence.historyList(HISTORY_LIMIT),
			}),
			kvSet: ({ key, value }: { key: string; value: unknown }) => {
				persistence.kvSet(key, value);
			},
			kvDelete: ({ key }: { key: string }) => {
				persistence.kvDelete(key);
			},
			serversReplaceAll: ({ entries }: { entries: Array<{ id: string; data: unknown }> }) => {
				persistence.serversReplaceAll(entries);
			},
			serversDelete: ({ id }: { id: string }) => {
				persistence.serversDelete(id);
			},
			historyAdd: ({ entry }: { entry: { songId: string; playedAt: number; song: unknown } }) => {
				persistence.historyAdd(entry, HISTORY_LIMIT);
			},
			historyClear: () => {
				persistence.historyClear();
			},
			setNowPlayingMeta: (meta: NowPlayingMeta | null) => {
				setNowPlayingMeta(meta);
			},
			updaterGetState: () => getUpdaterState(),
			updaterCheckNow: () => checkForUpdateNow(),
			updaterApply: () => applyUpdateNow(),
			setDiscordPrefs: (prefs: DiscordRuntimePrefs) => {
				discordPresence.setRuntimePrefs(prefs);
			},
			openDataFolder: () => {
				const path = Utils.paths.userData;
				if (process.platform === "darwin") {
					void spawn(["open", path]).exited;
				} else if (process.platform === "win32") {
					void spawn(["explorer", path]).exited;
				} else {
					void spawn(["xdg-open", path]).exited;
				}
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
installTray(mainWindow);
installGlobalShortcuts(mainWindow);
initUpdater(mainWindow);

process.on("beforeExit", () => {
	discordPresence.stop();
	disposeIntegrations();
	disposeUpdater();
});

console.log("Navidrome client started", mainWindow.id);
