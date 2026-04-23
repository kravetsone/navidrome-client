import { useStore } from "@nanostores/solid";
import { Pane, Row, Section, Toggle } from "../primitives/controls";
import { $discord, setPref } from "../../../stores/preferences";

export function DiscordPane() {
	const d = useStore($discord);
	return (
		<Pane
			eyebrow="Integrations"
			title="Discord"
			description="Show what you're listening to in your Discord profile. Connects automatically when the Discord desktop app is running."
		>
			<Section>
				<Row
					title="Show rich presence"
					hint="Turn off to disconnect and hide your activity entirely."
				>
					<Toggle
						checked={d().enabled}
						onChange={(v) => setPref("discord", "enabled", v)}
					/>
				</Row>
			</Section>

			<Section title="What to show">
				<Row title="Album artwork" hint="Displays the cover next to the song info.">
					<Toggle
						checked={d().showCoverArt}
						onChange={(v) => setPref("discord", "showCoverArt", v)}
					/>
				</Row>
				<Row title="Elapsed time" hint="Discord shows a live position ticker.">
					<Toggle
						checked={d().showTimestamps}
						onChange={(v) => setPref("discord", "showTimestamps", v)}
					/>
				</Row>
				<Row
					title="Clear when paused"
					hint="Remove the presence while playback is paused instead of freezing it."
				>
					<Toggle
						checked={d().clearWhenPaused}
						onChange={(v) => setPref("discord", "clearWhenPaused", v)}
					/>
				</Row>
			</Section>
		</Pane>
	);
}
