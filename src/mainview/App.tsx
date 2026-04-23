import { createEffect, onMount } from "solid-js";
import {
	Router,
	Route,
	useLocation,
	useNavigate,
	type RouteSectionProps,
} from "@solidjs/router";
import { rememberSearch, trackLocation } from "./stores/navigation";
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
import { SearchView } from "./features/search/SearchView";
import { SettingsView } from "./features/settings/SettingsView";
import { $activeServerId, pingActive } from "./stores/servers";
import {
	preloadAlbum,
	preloadAlbums,
	preloadArtist,
	preloadArtists,
	preloadFavorites,
	preloadHome,
	preloadPlaylist,
	preloadPlaylists,
	preloadRecent,
} from "./lib/queries/preload";

function Root(props: RouteSectionProps) {
	const location = useLocation();
	const navigate = useNavigate();
	onMount(() => {
		// Cold-start URL is views://mainview/index.html → pathname is
		// "/mainview/index.html", which matches no route. Normalize to "/".
		if (location.pathname.endsWith(".html")) {
			navigate("/", { replace: true });
		}
		if ($activeServerId.get()) void pingActive();
	});
	createEffect(() => {
		const path = location.pathname + location.search;
		if (path.endsWith(".html")) return;
		trackLocation(path);
		rememberSearch(location.pathname, location.search);
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
			<Route path="/" component={HomeView} preload={preloadHome} />
			<Route path="/albums" component={AlbumsView} preload={preloadAlbums} />
			<Route path="/album/:id" component={AlbumView} preload={preloadAlbum} />
			<Route path="/artists" component={ArtistsView} preload={preloadArtists} />
			<Route path="/artist/:id" component={ArtistView} preload={preloadArtist} />
			<Route
				path="/playlists"
				component={PlaylistsView}
				preload={preloadPlaylists}
			/>
			<Route
				path="/playlist/:id"
				component={PlaylistView}
				preload={preloadPlaylist}
			/>
			<Route
				path="/favorites"
				component={FavoritesView}
				preload={preloadFavorites}
			/>
			<Route path="/recent" component={RecentView} preload={preloadRecent} />
			<Route path="/search" component={SearchView} />
			<Route path="/connect" component={ConnectView} />
			<Route path="/settings" component={SettingsView} />
		</Router>
	);
}
