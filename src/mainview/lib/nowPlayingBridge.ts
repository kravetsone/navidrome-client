import { batched } from "nanostores";
import { $currentSong, $isPlaying } from "../stores/player";
import { appRPC } from "./electroview";
import type { NowPlayingMeta } from "../../shared/rpc-schema";

let lastSent: string | null = null;

function send(meta: NowPlayingMeta | null) {
	const key = meta
		? `${meta.title}|${meta.artist ?? ""}|${meta.album ?? ""}|${meta.isPlaying ? 1 : 0}`
		: "null";
	if (key === lastSent) return;
	lastSent = key;
	const fn = (
		appRPC as {
			request?: { setNowPlayingMeta?: (m: NowPlayingMeta | null) => Promise<void> };
		}
	).request?.setNowPlayingMeta;
	if (!fn) return;
	void fn(meta).catch(() => {});
}

export function installNowPlayingBridge(): void {
	const merged = batched([$currentSong, $isPlaying], (song, isPlaying) => ({
		song,
		isPlaying,
	}));
	merged.subscribe(({ song, isPlaying }) => {
		if (!song) {
			send(null);
			return;
		}
		send({
			title: song.title,
			artist: song.artist,
			album: song.album,
			isPlaying,
		});
	});
}
