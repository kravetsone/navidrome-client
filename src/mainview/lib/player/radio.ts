import {
	$currentIndex,
	$queue,
	$queueSources,
	$repeat,
	$smartRadio,
	appendRadioTracks,
} from "../../stores/player";
import { $activeServer } from "../../stores/servers";
import { $playHistory } from "../../stores/history";
import type { Song } from "../subsonic";
import { clientFor } from "../queries/useActiveClient";
import { queryClient } from "../queries/client";
import { qk } from "../queries/keys";

const PREFETCH_SIZE = 20;
const TARGET_LOOKAHEAD = 5;
const RADIO_STALE_MS = 24 * 60 * 60 * 1000;

let installed = false;
let inFlight = false;
let lastSeedId: string | null = null;

function pickSeedSong(): Song | null {
	const q = $queue.get();
	const idx = $currentIndex.get();
	if (idx < 0 || idx >= q.length) return null;
	const sources = $queueSources.get();
	// Prefer the latest user-picked song in the remaining queue so radio sticks
	// to the listener's intent rather than compounding on its own suggestions.
	for (let i = q.length - 1; i >= idx; i--) {
		const song = q[i]!;
		if (sources[song.id] !== "radio") return song;
	}
	return q[idx] ?? null;
}

async function fetchSimilar(seedId: string): Promise<Song[]> {
	const server = $activeServer.get();
	if (!server) return [];
	const client = clientFor(server);
	try {
		return await queryClient.fetchQuery({
			queryKey: qk.similar(server.id, seedId),
			queryFn: () => client.getSimilarSongs2(seedId, PREFETCH_SIZE),
			staleTime: RADIO_STALE_MS,
		});
	} catch {
		return [];
	}
}

function buildExclusions(): Set<string> {
	const excluded = new Set<string>();
	for (const s of $queue.get()) excluded.add(s.id);
	const hist = $playHistory.get();
	const recentCutoff = Math.min(hist.length, 50);
	for (let i = 0; i < recentCutoff; i++) excluded.add(hist[i]!.songId);
	return excluded;
}

async function topUp() {
	if (inFlight) return;
	if (!$smartRadio.get()) return;
	if ($repeat.get() === "all") return;

	const q = $queue.get();
	const idx = $currentIndex.get();
	if (idx < 0 || q.length === 0) return;

	const remaining = q.length - 1 - idx;
	if (remaining >= TARGET_LOOKAHEAD) return;

	const seed = pickSeedSong();
	if (!seed) return;
	// Don't hammer the same dry seed on every tick.
	if (seed.id === lastSeedId && remaining > 0) return;

	inFlight = true;
	try {
		const excluded = buildExclusions();
		let candidates = (await fetchSimilar(seed.id)).filter(
			(s) => !excluded.has(s.id),
		);

		// Navidrome often returns nothing for tracks without metadata; fall back
		// to similar-by-artist which is usually more generous.
		if (candidates.length === 0 && seed.artistId) {
			candidates = (await fetchSimilar(seed.artistId)).filter(
				(s) => !excluded.has(s.id),
			);
		}

		if (candidates.length === 0) {
			lastSeedId = seed.id;
			return;
		}

		lastSeedId = null;
		appendRadioTracks(candidates);
	} finally {
		inFlight = false;
	}
}

export function installSmartRadio() {
	if (installed) return;
	installed = true;
	$currentIndex.listen(() => {
		void topUp();
	});
	$queue.listen(() => {
		void topUp();
	});
	$smartRadio.listen((on) => {
		if (on) void topUp();
	});
}
