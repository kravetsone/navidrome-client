export interface PersistenceSnapshot {
	kv: Record<string, unknown>;
	servers: unknown[];
	history: Array<{ songId: string; playedAt: number; song: unknown }>;
}

export interface StoredServerEntry {
	id: string;
	data: unknown;
}

export interface HistoryEntryPayload {
	songId: string;
	playedAt: number;
	song: unknown;
}

export const HISTORY_LIMIT = 200;
