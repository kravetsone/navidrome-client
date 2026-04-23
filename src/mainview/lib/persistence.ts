import { appRPC } from "./electroview";
import type {
	HistoryEntryPayload,
	PersistenceSnapshot,
	StoredServerEntry,
} from "../../shared/persistence";

const EMPTY_SNAPSHOT: PersistenceSnapshot = { kv: {}, servers: [], history: [] };

let snapshot: PersistenceSnapshot = EMPTY_SNAPSHOT;
let hydrated = false;
let hydratePromise: Promise<PersistenceSnapshot> | null = null;

export async function hydratePersistence(): Promise<PersistenceSnapshot> {
	if (hydrated) return snapshot;
	if (hydratePromise) return hydratePromise;
	hydratePromise = (async () => {
		try {
			const result = await appRPC.request.persistenceSnapshot();
			snapshot = {
				kv: result?.kv ?? {},
				servers: Array.isArray(result?.servers) ? result.servers : [],
				history: Array.isArray(result?.history) ? result.history : [],
			};
		} catch (err) {
			console.warn("[persistence] hydrate failed, using empty state", err);
			snapshot = EMPTY_SNAPSHOT;
		} finally {
			hydrated = true;
		}
		return snapshot;
	})();
	return hydratePromise;
}

export function getSnapshot(): PersistenceSnapshot {
	return snapshot;
}

export function isHydrated(): boolean {
	return hydrated;
}

const KV_DEBOUNCE_MS = 200;
const kvTimers = new Map<string, ReturnType<typeof setTimeout>>();
const kvPending = new Map<string, unknown>();

export function persistKv(key: string, value: unknown): void {
	if (!hydrated) return;
	kvPending.set(key, value);
	const existing = kvTimers.get(key);
	if (existing) clearTimeout(existing);
	kvTimers.set(
		key,
		setTimeout(() => {
			kvTimers.delete(key);
			const v = kvPending.get(key);
			kvPending.delete(key);
			appRPC.request.kvSet({ key, value: v }).catch((err) => {
				console.warn(`[persistence] kvSet(${key}) failed`, err);
			});
		}, KV_DEBOUNCE_MS),
	);
}

export function flushKv(): void {
	for (const [key, timer] of kvTimers) {
		clearTimeout(timer);
		const v = kvPending.get(key);
		kvPending.delete(key);
		appRPC.request.kvSet({ key, value: v }).catch(() => {});
	}
	kvTimers.clear();
}

export function persistServersReplaceAll(entries: StoredServerEntry[]): void {
	if (!hydrated) return;
	appRPC.request.serversReplaceAll({ entries }).catch((err) => {
		console.warn("[persistence] serversReplaceAll failed", err);
	});
}

export function persistServerDelete(id: string): void {
	if (!hydrated) return;
	appRPC.request.serversDelete({ id }).catch((err) => {
		console.warn("[persistence] serversDelete failed", err);
	});
}

export function persistHistoryAdd(entry: HistoryEntryPayload): void {
	if (!hydrated) return;
	appRPC.request.historyAdd({ entry }).catch((err) => {
		console.warn("[persistence] historyAdd failed", err);
	});
}

export function persistHistoryClear(): void {
	if (!hydrated) return;
	appRPC.request.historyClear().catch((err) => {
		console.warn("[persistence] historyClear failed", err);
	});
}

window.addEventListener("beforeunload", flushKv);
