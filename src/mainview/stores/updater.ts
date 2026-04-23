import { atom, computed } from "nanostores";
import type { UpdaterState } from "../../shared/rpc-schema";
import { appRPC, registerUpdaterStateSink } from "../lib/electroview";

type BunRequests = {
	updaterGetState?: () => Promise<UpdaterState>;
	updaterCheckNow?: () => Promise<void>;
	updaterApply?: () => Promise<void>;
};

function bun(): BunRequests {
	return ((appRPC as { request?: BunRequests }).request ?? {}) as BunRequests;
}

export const $updaterState = atom<UpdaterState>({ kind: "idle" });

// Track the last version the user explicitly dismissed so the banner doesn't
// keep pestering them — but if a newer version arrives we re-show.
const $dismissedVersion = atom<string | null>(null);

// Track errors separately — they're dismissible independently of versioned
// cycles and shouldn't pollute the version-dismissal flag.
const $errorDismissed = atom(false);

export const $updaterBanner = computed(
	[$updaterState, $dismissedVersion, $errorDismissed],
	(state, dismissed, errDismissed) => {
		if (state.kind === "idle" || state.kind === "checking") return null;
		if (state.kind === "error") return errDismissed ? null : state;
		if (
			(state.kind === "downloading" || state.kind === "ready") &&
			dismissed !== null &&
			dismissed === state.version
		) {
			return null;
		}
		return state;
	},
);

export function setUpdaterState(next: UpdaterState) {
	$updaterState.set(next);
}

export function dismissUpdaterBanner() {
	const s = $updaterState.get();
	if (s.kind === "downloading" || s.kind === "ready") {
		$dismissedVersion.set(s.version);
	} else if (s.kind === "error") {
		$errorDismissed.set(true);
	}
}

export async function hydrateUpdaterState(): Promise<void> {
	const fn = bun().updaterGetState;
	if (!fn) return;
	try {
		const state = await fn();
		$updaterState.set(state);
	} catch {
		/* ignore — bun may not be ready yet */
	}
}

export function installUpdater(): void {
	registerUpdaterStateSink((state) => {
		const current = $updaterState.get();
		const isNewCycle =
			(state.kind === "downloading" || state.kind === "ready") &&
			(current.kind !== "downloading" && current.kind !== "ready" ||
				("version" in current && current.version !== state.version));
		const becameReady = state.kind === "ready" && current.kind !== "ready";
		if (isNewCycle || becameReady) {
			$dismissedVersion.set(null);
		}
		// Fresh error (not dismissed yet) → reset the dismissal so the user sees it.
		if (state.kind === "error" && current.kind !== "error") {
			$errorDismissed.set(false);
		}
		$updaterState.set(state);
	});
	void hydrateUpdaterState();
}

export async function triggerUpdateCheck(): Promise<void> {
	const fn = bun().updaterCheckNow;
	if (!fn) return;
	await fn().catch(() => {});
}

export async function applyUpdateNow(): Promise<void> {
	const fn = bun().updaterApply;
	if (!fn) return;
	await fn().catch(() => {});
}
