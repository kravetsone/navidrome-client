import { Pane, Row, Section } from "../primitives/controls";
import styles from "../primitives/controls.module.css";
import { resetPreferences } from "../../../stores/preferences";
import { appRPC } from "../../../lib/electroview";
import { queryClient } from "../../../lib/queries";
import { pushToast } from "../../../stores/toast";

export function AdvancedPane() {
	const onReset = () => {
		if (!confirm("Reset all preferences to defaults? Playback state won't be touched.")) {
			return;
		}
		resetPreferences();
		pushToast("Preferences reset to defaults.", { variant: "info" });
	};

	const onClearCache = () => {
		if (!confirm("Clear the library query cache? The app will refetch albums, artists, and playlists on next visit.")) {
			return;
		}
		queryClient.clear();
		pushToast("Query cache cleared.", { variant: "info" });
	};

	const onOpenFolder = () => {
		appRPC.request.openDataFolder().catch(() => {});
	};

	return (
		<Pane
			eyebrow="Settings"
			title="Advanced"
			description="Escape hatches. Reach for these when things feel stuck or you want a clean slate."
		>
			<Section title="Reset">
				<Row
					title="Reset preferences"
					hint="Restores every setting on this page to its default value."
				>
					<button
						type="button"
						class={styles.button}
						data-variant="danger"
						onClick={onReset}
					>
						Reset
					</button>
				</Row>
				<Row
					title="Clear library cache"
					hint="Forgets cached album/artist/playlist listings. Does not affect servers or playback history."
				>
					<button type="button" class={styles.button} onClick={onClearCache}>
						Clear cache
					</button>
				</Row>
			</Section>

			<Section title="Storage">
				<Row
					title="Open data folder"
					hint="Reveal the SQLite database and cached files in Finder."
				>
					<button type="button" class={styles.button} onClick={onOpenFolder}>
						Open in Finder
					</button>
				</Row>
			</Section>
		</Pane>
	);
}
