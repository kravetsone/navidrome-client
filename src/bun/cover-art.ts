import { persistence } from "./db";

const MEM_LIMIT = 500;
const LOOKUP_TIMEOUT_MS = 5000;
const DISK_HIT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DISK_MISS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DISK_MAX_ROWS = 10_000;

const mem = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(artist: string, album: string): string {
	return `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;
}

function evictIfNeeded() {
	if (mem.size <= MEM_LIMIT) return;
	const firstKey = mem.keys().next().value;
	if (firstKey !== undefined) mem.delete(firstKey);
}

async function fetchFromItunes(
	artist: string,
	album: string,
): Promise<string | null> {
	const term = encodeURIComponent(`${artist} ${album}`);
	const url = `https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=1`;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
	try {
		const res = await fetch(url, { signal: controller.signal });
		if (!res.ok) return null;
		const data = (await res.json()) as {
			results?: Array<{ artworkUrl100?: string }>;
		};
		const raw = data.results?.[0]?.artworkUrl100;
		if (!raw) return null;
		return raw.replace("100x100bb", "600x600bb");
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

function readDisk(key: string): string | null | undefined {
	// Check as a hit first (30-day TTL); if url is null, re-check with miss TTL.
	const row = persistence.coverArtGet(key, DISK_HIT_MAX_AGE_MS);
	if (row === undefined) return undefined;
	if (row !== null) return row;
	// Null result — apply shorter TTL so missing art can be re-probed.
	const miss = persistence.coverArtGet(key, DISK_MISS_MAX_AGE_MS);
	return miss === undefined ? undefined : miss;
}

export async function getCoverArtUrl(
	artist: string | undefined,
	album: string | undefined,
): Promise<string | null> {
	if (!artist || !album) return null;
	const key = cacheKey(artist, album);

	if (mem.has(key)) return mem.get(key) ?? null;

	const disk = readDisk(key);
	if (disk !== undefined) {
		mem.set(key, disk);
		evictIfNeeded();
		return disk;
	}

	const pending = inflight.get(key);
	if (pending) return pending;

	const promise = fetchFromItunes(artist, album).then((url) => {
		mem.set(key, url);
		evictIfNeeded();
		try {
			persistence.coverArtSet(key, url);
		} catch (err) {
			console.warn("[cover-art] persist failed", err);
		}
		inflight.delete(key);
		return url;
	});
	inflight.set(key, promise);
	return promise;
}

// Fire-and-forget housekeeping: drop stale rows, cap table size.
setTimeout(() => {
	try {
		persistence.coverArtMaintenance(DISK_HIT_MAX_AGE_MS, DISK_MAX_ROWS);
	} catch (err) {
		console.warn("[cover-art] maintenance failed", err);
	}
}, 5000);
