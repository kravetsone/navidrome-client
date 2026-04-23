import { Show } from "solid-js";
import { useStore } from "@nanostores/solid";
import styles from "./SettingsView.module.css";
import { SettingsSidebar, $settingsPane } from "./SettingsSidebar";
import { AppearancePane } from "./panes/AppearancePane";
import { PlaybackPane } from "./panes/PlaybackPane";
import { StreamingPane } from "./panes/StreamingPane";
import { DiscordPane } from "./panes/DiscordPane";
import { ServersPane } from "./panes/ServersPane";
import { AdvancedPane } from "./panes/AdvancedPane";
import { AboutPane } from "./panes/AboutPane";

export function SettingsView() {
	const active = useStore($settingsPane);
	return (
		<div class={styles.shell}>
			<SettingsSidebar />
			<div class={styles.content}>
				<Show when={active() === "appearance"}>
					<AppearancePane />
				</Show>
				<Show when={active() === "playback"}>
					<PlaybackPane />
				</Show>
				<Show when={active() === "streaming"}>
					<StreamingPane />
				</Show>
				<Show when={active() === "discord"}>
					<DiscordPane />
				</Show>
				<Show when={active() === "servers"}>
					<ServersPane />
				</Show>
				<Show when={active() === "advanced"}>
					<AdvancedPane />
				</Show>
				<Show when={active() === "about"}>
					<AboutPane />
				</Show>
			</div>
		</div>
	);
}
