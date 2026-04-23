import { batched } from "nanostores";
import { $currentSong } from "../stores/player";
import { $queueServer } from "../stores/servers";
import { clientFor } from "./queries/useActiveClient";
import { extractAmbientPalette } from "./palette";

export function installAmbientPrewarm(): void {
	const merged = batched([$currentSong, $queueServer], (song, server) => ({
		coverArt: song?.coverArt,
		server,
	}));
	let lastKey: string | null = null;
	merged.subscribe(({ coverArt, server }) => {
		if (!coverArt || !server) {
			lastKey = null;
			return;
		}
		const key = `${server.id}|${coverArt}`;
		if (key === lastKey) return;
		lastKey = key;
		const client = clientFor(server);
		const paletteUrl = client.coverArtUrl(coverArt, 96);
		if (paletteUrl) void extractAmbientPalette(paletteUrl);
		const backdropUrl = client.coverArtUrl(coverArt, 240);
		if (backdropUrl) {
			const preload = new Image();
			preload.decoding = "async";
			preload.src = backdropUrl;
		}
	});
}
