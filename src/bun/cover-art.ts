const CACHE_LIMIT = 500;
const LOOKUP_TIMEOUT_MS = 5000;
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

function cacheKey(artist: string, album: string): string {
	return `${artist.toLowerCase().trim()}|${album.toLowerCase().trim()}`;
}

function evictIfNeeded() {
	if (cache.size <= CACHE_LIMIT) return;
	const firstKey = cache.keys().next().value;
	if (firstKey !== undefined) cache.delete(firstKey);
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

export async function getCoverArtUrl(
	artist: string | undefined,
	album: string | undefined,
): Promise<string | null> {
	if (!artist || !album) return null;
	const key = cacheKey(artist, album);
	if (cache.has(key)) return cache.get(key) ?? null;
	const pending = inflight.get(key);
	if (pending) return pending;

	const promise = fetchFromItunes(artist, album).then((url) => {
		cache.set(key, url);
		evictIfNeeded();
		inflight.delete(key);
		return url;
	});
	inflight.set(key, promise);
	return promise;
}
