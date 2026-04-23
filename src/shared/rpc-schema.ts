import type { PresencePayload } from "./discord";

export type AppRPCSchema = {
	bun: {
		requests: {
			setDiscordPresence: { params: PresencePayload; response: void };
			clearDiscordPresence: { params: undefined; response: void };
		};
		messages: {};
	};
	webview: {
		requests: {};
		messages: {};
	};
};
