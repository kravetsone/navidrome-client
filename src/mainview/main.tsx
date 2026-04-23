import "./styles/global.css";
import { render } from "solid-js/web";
import { QueryClientProvider } from "@tanstack/solid-query";
import { queryClient } from "./lib/queries";
import { electroview } from "./lib/electroview";
import { hydratePersistence } from "./lib/persistence";
import { hydrateServers } from "./stores/servers";
import { hydratePlayer } from "./stores/player";
import { hydrateHistory } from "./stores/history";
import { initDiscordPresence } from "./stores/discord-presence";
import { installNowPlayingBridge } from "./lib/nowPlayingBridge";
import App from "./App";

void electroview;

async function boot() {
	await hydratePersistence();
	hydrateServers();
	hydratePlayer();
	hydrateHistory();
	initDiscordPresence();
	installNowPlayingBridge();

	render(
		() => (
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>
		),
		document.getElementById("app")!,
	);
}

void boot();
