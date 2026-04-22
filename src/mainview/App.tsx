import { Router, Route } from "@solidjs/router";
import { Disc3, Mic2, ListMusic, Heart, Clock, Settings as SettingsIcon } from "lucide-solid";
import { AppShell } from "./app/AppShell";
import { HomeView } from "./features/home/HomeView";
import { Placeholder } from "./components/Placeholder";

export default function App() {
	return (
		<Router root={(props) => <AppShell>{props.children}</AppShell>}>
			<Route path="/" component={HomeView} />
			<Route
				path="/albums"
				component={() => (
					<Placeholder
						icon={<Disc3 />}
						title="No albums yet"
						description="Connect your server and your albums will appear here."
					/>
				)}
			/>
			<Route
				path="/artists"
				component={() => (
					<Placeholder
						icon={<Mic2 />}
						title="No artists yet"
						description="Connect your server and your artists will appear here."
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
			<Route
				path="/settings"
				component={() => (
					<Placeholder
						icon={<SettingsIcon />}
						title="Settings"
						description="Server connection, playback, and appearance — coming in the next phase."
					/>
				)}
			/>
		</Router>
	);
}
