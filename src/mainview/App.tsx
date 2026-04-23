import { onMount } from "solid-js";
import { Router, Route, type RouteSectionProps } from "@solidjs/router";
import { AppShell } from "./app/AppShell";
import { ServerGuard } from "./app/ServerGuard";
import { HomeView } from "./features/home/HomeView";
import { AlbumsView } from "./features/albums/AlbumsView";
import { AlbumView } from "./features/album/AlbumView";
import { ArtistsView } from "./features/artists/ArtistsView";
import { ArtistView } from "./features/artist/ArtistView";
import { PlaylistsView } from "./features/playlists/PlaylistsView";
import { PlaylistView } from "./features/playlist/PlaylistView";
import { FavoritesView } from "./features/favorites/FavoritesView";
import { RecentView } from "./features/recent/RecentView";
import { ConnectView } from "./features/connect/ConnectView";
import { SettingsView } from "./features/settings/SettingsView";
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
			<Route path="/album/:id" component={AlbumView} />
			<Route path="/artists" component={ArtistsView} />
			<Route path="/artist/:id" component={ArtistView} />
			<Route path="/playlists" component={PlaylistsView} />
			<Route path="/playlist/:id" component={PlaylistView} />
			<Route path="/favorites" component={FavoritesView} />
			<Route path="/recent" component={RecentView} />
			<Route path="/connect" component={ConnectView} />
			<Route path="/settings" component={SettingsView} />
		</Router>
	);
}
