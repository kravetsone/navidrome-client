import { createMemo } from "solid-js";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../../stores/servers";
import { SubsonicClient } from "../subsonic/client";

export function useActiveClient() {
	const activeServer = useStore($activeServer);
	return createMemo(() => {
		const server = activeServer();
		if (!server) return null;
		return {
			client: new SubsonicClient(server),
			serverId: server.id,
		};
	});
}
