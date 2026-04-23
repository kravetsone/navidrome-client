import { Tray, GlobalShortcut } from "electrobun/bun";
import type { BrowserWindow } from "electrobun/bun";
import type { NowPlayingMeta, PlayerAction } from "../shared/rpc-schema";

const APP_NAME = "Navidrome";

let tray: Tray | null = null;
let currentMeta: NowPlayingMeta | null = null;
let mainWindowRef: BrowserWindow | null = null;

function truncate(s: string, n: number): string {
	if (s.length <= n) return s;
	return `${s.slice(0, n - 1)}…`;
}

function trayTitle(): string {
	if (!currentMeta) return APP_NAME;
	const sym = currentMeta.isPlaying ? "♪" : "‖";
	return `${sym} ${truncate(currentMeta.title, 30)}`;
}

async function dispatch(action: PlayerAction) {
	if (!mainWindowRef) return;
	try {
		await (
			mainWindowRef as {
				rpc?: {
					request?: {
						playerControl?: (p: { action: PlayerAction }) => Promise<void>;
					};
				};
			}
		).rpc?.request?.playerControl?.({ action });
	} catch (err) {
		console.error("Tray dispatch failed:", err);
	}
}

function buildMenu() {
	const np = currentMeta;
	const playing = np?.isPlaying === true;
	const nowPlayingLabel = np
		? truncate(`${np.title}${np.artist ? ` — ${np.artist}` : ""}`, 60)
		: "Nothing playing";

	return [
		{
			type: "normal" as const,
			label: nowPlayingLabel,
			enabled: false,
			action: "noop",
		},
		{ type: "divider" as const },
		{
			type: "normal" as const,
			label: playing ? "Pause" : "Play",
			enabled: !!np,
			action: "toggle",
		},
		{
			type: "normal" as const,
			label: "Next",
			enabled: !!np,
			action: "next",
		},
		{
			type: "normal" as const,
			label: "Previous",
			enabled: !!np,
			action: "prev",
		},
		{ type: "divider" as const },
		{
			type: "normal" as const,
			label: `Show ${APP_NAME}`,
			action: "show",
		},
		{ type: "divider" as const },
		{
			type: "normal" as const,
			label: `Quit ${APP_NAME}`,
			action: "quit",
		},
	];
}

function refresh() {
	if (!tray) return;
	try {
		tray.setMenu(buildMenu());
	} catch {}
	try {
		tray.setTitle(trayTitle());
	} catch {}
}

function handleTrayClicked(payload: unknown) {
	const action = (payload as { action?: string } | undefined)?.action;
	if (!action) return;
	switch (action) {
		case "toggle":
		case "next":
		case "prev":
			void dispatch(action);
			return;
		case "show":
			(mainWindowRef as { show?: () => void } | null)?.show?.();
			(mainWindowRef as { focus?: () => void } | null)?.focus?.();
			return;
		case "quit":
			try {
				GlobalShortcut.unregisterAll();
			} catch {}
			process.exit(0);
	}
}

export function installTray(mainWindow: BrowserWindow) {
	mainWindowRef = mainWindow;
	try {
		tray = new Tray({ title: APP_NAME, template: true });
		tray.setMenu(buildMenu());
		tray.on("tray-clicked", handleTrayClicked);
	} catch (err) {
		console.error("Failed to create tray:", err);
		tray = null;
	}
}

export function setNowPlayingMeta(meta: NowPlayingMeta | null) {
	currentMeta = meta;
	refresh();
}

export function installGlobalShortcuts(mainWindow: BrowserWindow) {
	mainWindowRef = mainWindow;
	const bindings: Array<[string, PlayerAction | "show"]> = [
		["MediaPlayPause", "toggle"],
		["MediaNextTrack", "next"],
		["MediaPreviousTrack", "prev"],
		["CommandOrControl+Shift+Space", "toggle"],
		["CommandOrControl+Shift+Right", "next"],
		["CommandOrControl+Shift+Left", "prev"],
		["CommandOrControl+Shift+N", "show"],
	];

	for (const [key, target] of bindings) {
		try {
			GlobalShortcut.register(key, () => {
				if (target === "show") {
					(mainWindowRef as { show?: () => void } | null)?.show?.();
					(mainWindowRef as { focus?: () => void } | null)?.focus?.();
					return;
				}
				void dispatch(target);
			});
		} catch (err) {
			console.warn(`Failed to register ${key}:`, err);
		}
	}
}

export function disposeIntegrations() {
	try {
		GlobalShortcut.unregisterAll();
	} catch {}
	try {
		tray?.remove();
	} catch {}
	tray = null;
	mainWindowRef = null;
}
