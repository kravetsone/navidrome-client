import { onMount } from "solid-js";
import { Router, Route, type RouteSectionProps } from "@solidjs/router";
import { Disc3, Mic2, ListMusic, Heart, Clock } from "lucide-solid";
import { AppShell } from "./app/AppShell";
import { ServerGuard } from "./app/ServerGuard";
import { HomeView } from "./features/home/HomeView";
import { ConnectView } from "./features/connect/ConnectView";
import { SettingsView } from "./features/settings/SettingsView";
import { Placeholder } from "./components/Placeholder";
import { $activeServerId, pingActive } from "./stores/servers";

function Root(props: RouteSectionProps) {
	onMount(() => {
		if ($activeServerId.get()) void pingActive();
	});
	return (
		<AppShell>
			<ServerGuard>{props.children}</ServerGuard>
		</AppShell>
	);
}

export default function App() {
	return (
		<Router root={Root}>
			<Route path="/" component={HomeView} />
			<Route path="/connect" component={ConnectView} />
			<Route path="/settings" component={SettingsView} />
			<Route
				path="/albums"
				component={() => (
					<Placeholder
						icon={<Disc3 />}
						title="No albums yet"
						description="Your albums will appear here once a server is connected."
					/>
				)}
			/>
			<Route
				path="/artists"
				component={() => (
					<Placeholder
						icon={<Mic2 />}
						title="No artists yet"
						description="Your artists will appear here once a server is connected."
					/>
				)}
			/>
			<Route
				path="/playlists"
				component={() => (
					<Placeholder
						icon={<ListMusic />}
						title="No playlists yet"
						description="Create playlists or sync them from your server."
					/>
				)}
			/>
			<Route
				path="/favorites"
				component={() => (
					<Placeholder
						icon={<Heart />}
						title="No favorites yet"
						description="Songs you love will gather here."
					/>
				)}
			/>
			<Route
				path="/recent"
				component={() => (
					<Placeholder
						icon={<Clock />}
						title="Nothing played yet"
						description="Your listening history will appear here."
					/>
				)}
			/>
		</Router>
	);
}
