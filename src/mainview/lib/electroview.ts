import Electrobun, { Electroview } from "electrobun/view";
import type {
	AppRPCSchema,
	PlayerAction,
	UpdaterState,
} from "../../shared/rpc-schema";
import {
	playNext,
	playPrevious,
	togglePlay,
	$isPlaying,
} from "../stores/player";

function handlePlayerControl({ action }: { action: PlayerAction }) {
	switch (action) {
		case "toggle":
			togglePlay();
			return;
		case "play":
			if (!$isPlaying.get()) togglePlay();
			return;
		case "pause":
			if ($isPlaying.get()) togglePlay();
			return;
		case "next":
			playNext();
			return;
		case "prev":
			playPrevious();
			return;
	}
}

// Late-bound so electroview.ts stays free of nanostore imports at top-level
// (avoids a circular import with stores/updater, which imports appRPC).
let updaterStateSink: ((state: UpdaterState) => void) | null = null;
export function registerUpdaterStateSink(fn: (state: UpdaterState) => void) {
	updaterStateSink = fn;
}

const rpc = Electroview.defineRPC<AppRPCSchema>({
	handlers: {
		requests: {
			playerControl: handlePlayerControl,
			updaterState: (state: UpdaterState) => {
				updaterStateSink?.(state);
			},
		},
	},
});

export const electroview = new Electrobun.Electroview({ rpc });
export const appRPC = rpc;
