import { atom, computed } from "nanostores";
import { SubsonicClient } from "../lib/subsonic/client";
import { probeServer } from "../lib/subsonic/probe";
import type { ServerConfig } from "../lib/subsonic/types";
import {
	getSnapshot,
	persistKv,
	persistServersReplaceAll,
} from "../lib/persistence";

export type ConnectionStatus = "unknown" | "connecting" | "online" | "offline";

export const $servers = atom<ServerConfig[]>([]);
export const $activeServerId = atom<string | null>(null);
export const $status = atom<ConnectionStatus>("unknown");

export const $activeServer = computed(
	[$servers, $activeServerId],
	(list, id) => list.find((s) => s.id === id) ?? null,
);

export const $hasServers = computed($servers, (list) => list.length > 0);

let wired = false;

export function hydrateServers(): void {
	const snap = getSnapshot();
	const servers = snap.servers.filter(
		(s): s is ServerConfig =>
			typeof s === "object" && s !== null && typeof (s as ServerConfig).id === "string",
	);
	$servers.set(servers);
	const activeId = snap.kv.activeServerId;
	$activeServerId.set(typeof activeId === "string" ? activeId : null);

	if (!wired) {
		wired = true;
		$servers.listen((list) => {
			persistServersReplaceAll(list.map((s) => ({ id: s.id, data: s })));
		});
		$activeServerId.listen((id) => {
			persistKv("activeServerId", id);
		});
	}
}

export function addServer(server: ServerConfig, makeActive = true) {
	const list = $servers.get();
	const exists = list.find((s) => s.id === server.id);
	const next = exists
		? list.map((s) => (s.id === server.id ? server : s))
		: [...list, server];
	$servers.set(next);
	if (makeActive || !$activeServerId.get()) {
		$activeServerId.set(server.id);
	}
}

export function updateServer(id: string, patch: Partial<ServerConfig>) {
	$servers.set(
		$servers.get().map((s) => (s.id === id ? { ...s, ...patch } : s)),
	);
}

export function removeServer(id: string) {
	const next = $servers.get().filter((s) => s.id !== id);
	$servers.set(next);
	void import("../lib/queries/useActiveClient").then((m) => m.invalidateClient(id));
	if ($activeServerId.get() === id) {
		$activeServerId.set(next[0]?.id ?? null);
	}
}

export function setActive(id: string) {
	if ($servers.get().some((s) => s.id === id)) {
		$activeServerId.set(id);
		$status.set("unknown");
	}
}

export function activeClient(): SubsonicClient | null {
	const server = $activeServer.get();
	if (!server) return null;
	return new SubsonicClient(server);
}

export async function pingActive(): Promise<boolean> {
	const server = $activeServer.get();
	if (!server) {
		$status.set("unknown");
		return false;
	}
	$status.set("connecting");
	try {
		const result = await probeServer({
			url: server.url,
			username: server.username,
			authMode: server.authMode,
			secret: server.secret,
		});
		updateServer(server.id, { caps: result.caps });
		$status.set("online");
		return true;
	} catch {
		$status.set("offline");
		return false;
	}
}
