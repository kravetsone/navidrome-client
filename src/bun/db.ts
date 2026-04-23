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
};

export type Persistence = typeof persistence;
