import {
	dehydrate,
	hydrate,
	type DehydratedState,
	type Query,
	type QueryClient,
} from "@tanstack/solid-query";
import { getSnapshot, persistKv } from "../persistence";

const KEY = "queryCache";
const BUSTER = "v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const THROTTLE_MS = 3000;

const VOLATILE_FEATURES = new Set(["ping", "search"]);

interface PersistedCache {
	buster: string;
	timestamp: number;
	state: DehydratedState;
}

function shouldDehydrateQuery(query: Query): boolean {
	if (query.state.status !== "success") return false;
	if (query.state.data === undefined) return false;
	const key = query.queryKey as readonly unknown[];
	// Keys start with ["server", serverId, feature, ...]
	const feature = key[2];
	if (typeof feature === "string" && VOLATILE_FEATURES.has(feature)) return false;
	return true;
}

export function restoreQueryCache(client: QueryClient): void {
	const raw = getSnapshot().kv[KEY];
	if (!raw || typeof raw !== "object") return;
	const p = raw as Partial<PersistedCache>;
	if (p.buster !== BUSTER) return;
	if (typeof p.timestamp !== "number") return;
	if (Date.now() - p.timestamp > MAX_AGE_MS) return;
	if (!p.state) return;
	try {
		hydrate(client, p.state);
	} catch (err) {
		console.warn("[queryPersist] hydrate failed", err);
	}
}

export function attachQueryPersister(client: QueryClient): void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pending = false;

	const save = () => {
		pending = false;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		const state = dehydrate(client, { shouldDehydrateQuery });
		const payload: PersistedCache = {
			buster: BUSTER,
			timestamp: Date.now(),
			state,
		};
		persistKv(KEY, payload);
	};

	const schedule = () => {
		pending = true;
		if (timer) return;
		timer = setTimeout(() => {
			timer = null;
			if (pending) save();
		}, THROTTLE_MS);
	};

	client.getQueryCache().subscribe((event) => {
		if (event.type === "added" || event.type === "removed" || event.type === "updated") {
			schedule();
		}
	});

	window.addEventListener("beforeunload", () => {
		if (pending) save();
	});
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden" && pending) save();
	});
}

export function clearPersistedQueryCache(): void {
	persistKv(KEY, null);
}
