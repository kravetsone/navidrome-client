import { createMemo } from "solid-js";
import { useStore } from "@nanostores/solid";
import { $activeServer, $queueServer } from "../../stores/servers";
import { SubsonicClient } from "../subsonic/client";
import type { ServerConfig } from "../subsonic/types";

interface CacheEntry {
	client: SubsonicClient;
	signature: string;
}

const clientCache = new Map<string, CacheEntry>();

function sig(server: ServerConfig): string {
	return `${server.url}|${server.username}|${server.authMode}|${server.secret}`;
}

export function clientFor(server: ServerConfig): SubsonicClient {
	const signature = sig(server);
	const cached = clientCache.get(server.id);
	if (cached && cached.signature === signature) return cached.client;
	const client = new SubsonicClient(server);
	clientCache.set(server.id, { client, signature });
	return client;
}

export function invalidateClient(serverId: string): void {
	clientCache.delete(serverId);
}

export function useActiveClient() {
	const activeServer = useStore($activeServer);
	return createMemo(() => {
		const server = activeServer();
		if (!server) return null;
		return { client: clientFor(server), serverId: server.id };
	});
}

/**
 * Client tied to the server the current queue was loaded from. Player, queue,
 * and now-playing chrome must resolve cover/stream URLs through this — not
 * the active-server client — so playback keeps working while the user browses
 * a different library.
 */
export function useQueueClient() {
	const queueServer = useStore($queueServer);
	return createMemo(() => {
		const server = queueServer();
		if (!server) return null;
		return { client: clientFor(server), serverId: server.id };
	});
}

export function clientForQueue(): SubsonicClient | null {
	const server = $queueServer.get();
	if (!server) return null;
	return clientFor(server);
}
