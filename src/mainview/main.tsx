import "./styles/global.css";
import { render } from "solid-js/web";
import { QueryClientProvider } from "@tanstack/solid-query";
import { queryClient } from "./lib/queries";
import { electroview } from "./lib/electroview";
import { initDiscordPresence } from "./stores/discord-presence";
import App from "./App";

void electroview;
initDiscordPresence();

render(
	() => (
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	),
	document.getElementById("app")!,
);
