import { onMount } from "solid-js";
import { Router, Route, type RouteSectionProps } from "@solidjs/router";
import { Heart, Clock } from "lucide-solid";
import { AppShell } from "./app/AppShell";
import { ServerGuard } from "./app/ServerGuard";
import { HomeView } from "./features/home/HomeView";
import { AlbumsView } from "./features/albums/AlbumsView";
import { ArtistsView } from "./features/artists/ArtistsView";
import { PlaylistsView } from "./features/playlists/PlaylistsView";
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
			<Route path="/albums" component={AlbumsView} />
			<Route path="/artists" component={ArtistsView} />
			<Route path="/playlists" component={PlaylistsView} />
			<Route path="/connect" component={ConnectView} />
			<Route path="/settings" component={SettingsView} />
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
