import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Utils } from "electrobun/bun";

export interface StoredServer {
	id: string;
	position: number;
	data: string;
}

export interface StoredHistoryRow {
	song_id: string;
	played_at: number;
	song: string;
}

const DB_FILENAME = "navidrome-client.db";

function openDb(): Database {
	const dir = Utils.paths.userData;
	mkdirSync(dir, { recursive: true });
	const path = join(dir, DB_FILENAME);
	const db = new Database(path, { create: true });
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA foreign_keys = ON");
	db.exec("PRAGMA synchronous = NORMAL");
	return db;
}

function runMigrations(db: Database): void {
	const row = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
	const current = row?.user_version ?? 0;

	if (current < 1) {
		db.transaction(() => {
			db.exec(`
				CREATE TABLE IF NOT EXISTS kv (
					key   TEXT PRIMARY KEY,
					value TEXT NOT NULL
				);
				CREATE TABLE IF NOT EXISTS servers (
					id       TEXT PRIMARY KEY,
					position INTEGER NOT NULL,
					data     TEXT NOT NULL
				);
				CREATE INDEX IF NOT EXISTS idx_servers_position ON servers(position);
				CREATE TABLE IF NOT EXISTS history (
					id        INTEGER PRIMARY KEY AUTOINCREMENT,
					song_id   TEXT NOT NULL,
					played_at INTEGER NOT NULL,
					song      TEXT NOT NULL
				);
				CREATE INDEX IF NOT EXISTS idx_history_played_at ON history(played_at DESC);
			`);
			db.exec("PRAGMA user_version = 1");
		})();
	}

	if (current < 2) {
		db.transaction(() => {
			db.exec(`
				CREATE TABLE IF NOT EXISTS cover_art_lookups (
					key       TEXT PRIMARY KEY,
					url       TEXT,
					stored_at INTEGER NOT NULL
				);
				CREATE INDEX IF NOT EXISTS idx_cover_art_stored_at ON cover_art_lookups(stored_at);
			`);
			db.exec("PRAGMA user_version = 2");
		})();
	}
}

const db = openDb();
runMigrations(db);

const kvSelectAll = db.query<{ key: string; value: string }, []>(
	"SELECT key, value FROM kv",
);
const kvUpsert = db.query<null, [string, string]>(
	"INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
);
const kvDelete = db.query<null, [string]>("DELETE FROM kv WHERE key = ?");

const serversSelectAll = db.query<StoredServer, []>(
	"SELECT id, position, data FROM servers ORDER BY position ASC",
);
const serversUpsert = db.query<null, [string, number, string]>(
	"INSERT INTO servers (id, position, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET position = excluded.position, data = excluded.data",
);
const serversDelete = db.query<null, [string]>("DELETE FROM servers WHERE id = ?");

const historySelectRecent = db.query<StoredHistoryRow, [number]>(
	"SELECT song_id, played_at, song FROM history ORDER BY played_at DESC LIMIT ?",
);
const historyInsert = db.query<null, [string, number, string]>(
	"INSERT INTO history (song_id, played_at, song) VALUES (?, ?, ?)",
);
const historyTrim = db.query<null, [number]>(
	"DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY played_at DESC LIMIT ?)",
);
const historyClear = db.query<null, []>("DELETE FROM history");

const coverArtSelect = db.query<
	{ url: string | null; stored_at: number },
	[string]
>("SELECT url, stored_at FROM cover_art_lookups WHERE key = ?");
const coverArtUpsert = db.query<null, [string, string | null, number]>(
	"INSERT INTO cover_art_lookups (key, url, stored_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET url = excluded.url, stored_at = excluded.stored_at",
);
const coverArtPrune = db.query<null, [number]>(
	"DELETE FROM cover_art_lookups WHERE stored_at < ?",
);
const coverArtCount = db.query<{ n: number }, []>(
	"SELECT COUNT(*) as n FROM cover_art_lookups",
);
const coverArtTrimToLimit = db.query<null, [number]>(
	"DELETE FROM cover_art_lookups WHERE key IN (SELECT key FROM cover_art_lookups ORDER BY stored_at ASC LIMIT ?)",
);

export const persistence = {
	kvGetAll(): Record<string, unknown> {
		const out: Record<string, unknown> = {};
		for (const row of kvSelectAll.all()) {
			try {
				out[row.key] = JSON.parse(row.value);
			} catch {
				// skip corrupt row
			}
		}
		return out;
	},

	kvSet(key: string, value: unknown): void {
		kvUpsert.run(key, JSON.stringify(value));
	},

	kvDelete(key: string): void {
		kvDelete.run(key);
	},

	serversList(): Array<{ id: string; position: number; data: unknown }> {
		return serversSelectAll.all().map((r) => ({
			id: r.id,
			position: r.position,
			data: JSON.parse(r.data),
		}));
	},

	serversReplaceAll(entries: Array<{ id: string; data: unknown }>): void {
		db.transaction(() => {
			db.exec("DELETE FROM servers");
			for (let i = 0; i < entries.length; i++) {
				const e = entries[i]!;
				serversUpsert.run(e.id, i, JSON.stringify(e.data));
			}
		})();
	},

	serversUpsert(id: string, position: number, data: unknown): void {
		serversUpsert.run(id, position, JSON.stringify(data));
	},

	serversDelete(id: string): void {
		serversDelete.run(id);
	},

	historyList(limit: number): Array<{ songId: string; playedAt: number; song: unknown }> {
		return historySelectRecent.all(limit).map((r) => ({
			songId: r.song_id,
			playedAt: r.played_at,
			song: JSON.parse(r.song),
		}));
	},

	historyAdd(entry: { songId: string; playedAt: number; song: unknown }, trimTo: number): void {
		db.transaction(() => {
			historyInsert.run(entry.songId, entry.playedAt, JSON.stringify(entry.song));
			historyTrim.run(trimTo);
		})();
	},

	historyClear(): void {
		historyClear.run();
	},

	coverArtGet(key: string, maxAgeMs: number): string | null | undefined {
		const row = coverArtSelect.get(key);
		if (!row) return undefined;
		if (Date.now() - row.stored_at > maxAgeMs) return undefined;
		return row.url;
	},

	coverArtSet(key: string, url: string | null): void {
		coverArtUpsert.run(key, url, Date.now());
	},

	coverArtMaintenance(maxAgeMs: number, maxRows: number): void {
		coverArtPrune.run(Date.now() - maxAgeMs);
		const row = coverArtCount.get();
		const n = row?.n ?? 0;
		if (n > maxRows) coverArtTrimToLimit.run(n - maxRows);
	},
};

export type Persistence = typeof persistence;
