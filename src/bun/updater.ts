import { Updater } from "electrobun/bun";
import type { BrowserWindow } from "electrobun/bun";
import type { UpdaterState } from "../shared/rpc-schema";

const STARTUP_DELAY_MS =
	Number(process.env.UPDATER_STARTUP_DELAY_MS) || 15_000;
const CHECK_INTERVAL_MS =
	Number(process.env.UPDATER_CHECK_INTERVAL_MS) || 6 * 60 * 60 * 1000;

type WindowWithView = BrowserWindow & {
	webview?: {
		rpc?: {
			request?: {
				updaterState?: (s: UpdaterState) => Promise<void>;
			};
		};
	};
};

let windowRef: BrowserWindow | null = null;
let currentState: UpdaterState = { kind: "idle" };
let runningCheck: Promise<void> | null = null;
let scheduled: ReturnType<typeof setInterval> | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;

function pushState(next: UpdaterState) {
	currentState = next;
	// The live RPC proxy lives on mainWindow.webview.rpc — BrowserWindow
	// accepts `rpc` as a constructor option but never stores it on itself,
	// so hitting mainWindow.rpc silently drops the push.
	const target = windowRef as WindowWithView | null;
	const req = target?.webview?.rpc?.request?.updaterState;
	if (!req) return;
	req(next).catch((err) =>
		console.warn(`[updater] push failed kind=${next.kind}:`, err),
	);
}

export function getUpdaterState(): UpdaterState {
	return currentState;
}

let lastErrorFromStream: string | null = null;

export function initUpdater(mainWindow: BrowserWindow): void {
	windowRef = mainWindow;

	Updater.onStatusChange((entry) => {
		if (entry.status === "error") {
			lastErrorFromStream = entry.details?.errorMessage ?? entry.message;
			return;
		}
		if (currentState.kind === "downloading" && entry.status === "download-progress") {
			const p = entry.details?.progress;
			// Electrobun emits progress as 0-100 percent.
			if (typeof p === "number") {
				pushState({ ...currentState, progress: p / 100 });
			}
		}
	});

	startupTimer = setTimeout(() => {
		void runCheck();
		scheduled = setInterval(() => {
			void runCheck();
		}, CHECK_INTERVAL_MS);
	}, STARTUP_DELAY_MS);
}

export function disposeUpdater(): void {
	if (startupTimer) clearTimeout(startupTimer);
	if (scheduled) clearInterval(scheduled);
	startupTimer = null;
	scheduled = null;
	Updater.onStatusChange(null);
}

async function runCheck(): Promise<void> {
	if (runningCheck) return runningCheck;
	// Don't re-check while an update is already downloaded and waiting.
	if (currentState.kind === "ready" || currentState.kind === "downloading") {
		return;
	}
	runningCheck = (async () => {
		try {
			pushState({ kind: "checking" });
			lastErrorFromStream = null;
			const info = await Updater.checkForUpdate();
			if (info.error) {
				pushState({ kind: "error", message: info.error });
				return;
			}
			if (!info.updateAvailable) {
				pushState({ kind: "idle" });
				return;
			}
			const version = info.version || "";
			pushState({ kind: "downloading", version });
			await Updater.downloadUpdate();
			// downloadUpdate resolves successfully even on decompression
			// failure — inspect the canonical updateInfo for a post-hoc error
			// and cross-check against the most recent "error" event from the
			// status stream.
			const post = Updater.updateInfo();
			const streamErr = lastErrorFromStream;
			if (post?.error) {
				pushState({ kind: "error", message: post.error });
				return;
			}
			if (!post?.updateReady) {
				pushState({
					kind: "error",
					message: streamErr ?? "Update download finished but bundle was not ready.",
				});
				return;
			}
			pushState({ kind: "ready", version });
		} catch (err) {
			pushState({
				kind: "error",
				message: err instanceof Error ? err.message : String(err),
			});
		} finally {
			runningCheck = null;
		}
	})();
	return runningCheck;
}

export async function checkNow(): Promise<void> {
	// Manual check: clear error/idle so the banner re-surfaces.
	if (currentState.kind === "error" || currentState.kind === "idle") {
		pushState({ kind: "idle" });
	}
	await runCheck();
}

export async function applyUpdateNow(): Promise<void> {
	if (currentState.kind !== "ready") return;
	try {
		await Updater.applyUpdate();
	} catch (err) {
		pushState({
			kind: "error",
			message: err instanceof Error ? err.message : String(err),
		});
	}
}
