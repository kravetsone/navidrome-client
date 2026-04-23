import Electrobun, { Electroview } from "electrobun/view";
import type { AppRPCSchema, PlayerAction } from "../../shared/rpc-schema";
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

const rpc = Electroview.defineRPC<AppRPCSchema>({
	handlers: {
		requests: {
			playerControl: handlePlayerControl,
		},
	},
});

export const electroview = new Electrobun.Electroview({ rpc });
export const appRPC = rpc;
