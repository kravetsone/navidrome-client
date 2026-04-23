import "./styles/global.css";
import { render } from "solid-js/web";
import { QueryClientProvider } from "@tanstack/solid-query";
import { queryClient } from "./lib/queries";
import { electroview } from "./lib/electroview";
import { hydratePersistence } from "./lib/persistence";
import { attachQueryPersister, restoreQueryCache } from "./lib/queries/persist";
import { hydrateServers } from "./stores/servers";
import { hydratePlayer } from "./stores/player";
import { hydrateHistory } from "./stores/history";
import { hydratePreferences } from "./stores/preferences";
import { installAppearanceEffect } from "./lib/accent-palette";
import { initDiscordPresence } from "./stores/discord-presence";
import { installNowPlayingBridge } from "./lib/nowPlayingBridge";
import { installSmartRadio } from "./lib/player/radio";
import { installAmbientPrewarm } from "./lib/ambient-prewarm";
import { installUpdater } from "./stores/updater";
import App from "./App";

void electroview;

async function boot() {
	await hydratePersistence();
	hydratePreferences();
	installAppearanceEffect();
	hydrateServers();
	hydratePlayer();
	hydrateHistory();
	restoreQueryCache(queryClient);
	attachQueryPersister(queryClient);
	initDiscordPresence();
	installNowPlayingBridge();
	installSmartRadio();
	installAmbientPrewarm();
	installUpdater();

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
