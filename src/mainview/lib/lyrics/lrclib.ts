import type { LyricLine, StructuredLyrics } from "../subsonic";

const LRCLIB_BASE = "https://lrclib.net/api";

interface LrclibRecord {
	id: number;
	trackName: string;
	artistName: string;
	albumName?: string;
	duration?: number;
	instrumental?: boolean;
	syncedLyrics?: string | null;
	plainLyrics?: string | null;
}

/**
 * Parse an LRC string "[mm:ss.xx] text" into structured lines with millisecond
 * start times. Multiple timestamp prefixes on one line (e.g. karaoke duplicates
 * a refrain) each produce their own line — LRCLIB normally uses one timestamp
 * per line but being defensive costs nothing.
 */
function parseLrc(synced: string): LyricLine[] {
	const out: LyricLine[] = [];
	for (const raw of synced.split(/\r?\n/)) {
		// Collect all [mm:ss(.xx)] prefixes, then the remaining text after the last one.
		const prefixRe = /\[(\d+):(\d+)(?:[.:](\d+))?\]/g;
		const starts: number[] = [];
		let m: RegExpExecArray | null;
		let lastIdx = 0;
		while ((m = prefixRe.exec(raw)) !== null) {
			const minutes = Number(m[1]);
			const seconds = Number(m[2]);
			const centis = m[3] ? Number(m[3].padEnd(3, "0").slice(0, 3)) : 0;
			starts.push(minutes * 60_000 + seconds * 1000 + centis);
			lastIdx = prefixRe.lastIndex;
		}
		if (starts.length === 0) continue;
		const text = raw.slice(lastIdx).trim();
		// Empty line ([mm:ss] with no text) → render as a musical pause placeholder.
		const value = text.length > 0 ? text : "";
		for (const start of starts) out.push({ start, value });
	}
	out.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
	return out;
}

function normalize(s: string): string {
	return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").trim();
}

function splitArtists(artist: string): string[] {
	return artist
		.split(/,|&|×|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b/i)
		.map((s) => s.trim())
		.filter(Boolean);
}

async function lrclibGet(
	params: Record<string, string | number | undefined>,
): Promise<LrclibRecord | null> {
	const search = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v === undefined || v === "" || v === null) continue;
		search.set(k, String(v));
	}
	try {
		const res = await fetch(`${LRCLIB_BASE}/get?${search}`, {
			credentials: "omit",
		});
		if (!res.ok) return null;
		return (await res.json()) as LrclibRecord;
	} catch {
		return null;
	}
}

async function lrclibSearch(query: string): Promise<LrclibRecord[]> {
	try {
		const res = await fetch(
			`${LRCLIB_BASE}/search?q=${encodeURIComponent(query)}`,
			{ credentials: "omit" },
		);
		if (!res.ok) return [];
		return (await res.json()) as LrclibRecord[];
	} catch {
		return [];
	}
}

function toStructured(record: LrclibRecord): StructuredLyrics | null {
	if (record.instrumental) return null;
	if (record.syncedLyrics) {
		const line = parseLrc(record.syncedLyrics);
		if (line.length > 0) {
			return {
				displayArtist: record.artistName,
				displayTitle: record.trackName,
				synced: true,
				line,
				source: "lrclib",
			};
		}
	}
	if (record.plainLyrics) {
		const line = record.plainLyrics
			.split(/\r?\n/)
			.map((value) => ({ value: value.trim() }))
			.filter((l) => l.value.length > 0);
		if (line.length > 0) {
			return {
				displayArtist: record.artistName,
				displayTitle: record.trackName,
				synced: false,
				line,
				source: "lrclib",
			};
		}
	}
	return null;
}

function pickFromSearch(
	results: LrclibRecord[],
	artistTokens: string[],
): StructuredLyrics | null {
	// Prefer records whose artist string shares any normalized token with the query,
	// and prefer synced over plain. Title-only searches can return ~20 hits across
	// unrelated artists — the token filter is what keeps us from picking a namesake.
	let syncedPick: LrclibRecord | null = null;
	let plainPick: LrclibRecord | null = null;
	for (const r of results) {
		if (artistTokens.length > 0) {
			const resultArtist = normalize(r.artistName);
			const ok = artistTokens.some((t) => t && resultArtist.includes(t));
			if (!ok) continue;
		}
		if (!syncedPick && r.syncedLyrics) syncedPick = r;
		if (!plainPick && r.plainLyrics) plainPick = r;
		if (syncedPick && plainPick) break;
	}
	const picked = syncedPick ?? plainPick;
	return picked ? toStructured(picked) : null;
}

/**
 * Fetch lyrics from the LRCLIB public database as a fallback when Navidrome
 * has nothing for the track. Uses a ladder of strategies (most-specific first)
 * so an exact metadata match stops early and only obscure / mis-tagged tracks
 * pay the cost of a broader search.
 */
export async function fetchFromLrclib(params: {
	artist: string;
	title: string;
	duration?: number;
}): Promise<StructuredLyrics | null> {
	const artist = params.artist.trim();
	const title = params.title.trim();
	if (!artist || !title) return null;

	// 1) Direct /get with duration (±2s tolerance on LRCLIB's side).
	if (params.duration && params.duration > 0) {
		const direct = await lrclibGet({
			artist_name: artist,
			track_name: title,
			duration: Math.round(params.duration),
		});
		if (direct) {
			const s = toStructured(direct);
			if (s) return s;
		}
	}

	// 2) Direct /get without duration (our duration may be off enough to miss ±2s).
	const noDur = await lrclibGet({
		artist_name: artist,
		track_name: title,
	});
	if (noDur) {
		const s = toStructured(noDur);
		if (s) return s;
	}

	// 3) Per-collaborator /get — handles multi-artist tracks where LRCLIB stores
	// the record under just one of the collaborators.
	const collaborators = splitArtists(artist);
	if (collaborators.length > 1) {
		for (const single of collaborators) {
			const r = await lrclibGet({
				artist_name: single,
				track_name: title,
			});
			if (r) {
				const s = toStructured(r);
				if (s) return s;
			}
		}
	}

	// 4) Broad search + artist-token filter.
	const artistTokens = collaborators.map(normalize).filter(Boolean);
	const results = await lrclibSearch(`${artist} ${title}`);
	if (results.length > 0) {
		const s = pickFromSearch(results, artistTokens);
		if (s) return s;
	}

	// 5) Title-only last-ditch — only useful if the title is distinctive enough
	// that it's in LRCLIB's top ~20 hits for the title alone.
	if (artistTokens.length > 0) {
		const byTitle = await lrclibSearch(title);
		if (byTitle.length > 0) {
			const s = pickFromSearch(byTitle, artistTokens);
			if (s) return s;
		}
	}

	return null;
}
