import { Show } from "solid-js";
import { useStore } from "@nanostores/solid";
import { RefreshCw } from "lucide-solid";
import { Pane, Row, Section } from "../primitives/controls";
import styles from "../primitives/controls.module.css";
import type { UpdaterState } from "../../../../shared/rpc-schema";
import {
	$updaterState,
	applyUpdateNow,
	triggerUpdateCheck,
} from "../../../stores/updater";

function updaterHint(s: UpdaterState): string {
	switch (s.kind) {
		case "idle":
			return `Currently running v${__APP_VERSION__}. You're up to date.`;
		case "checking":
			return "Contacting the update server…";
		case "downloading":
			return `Downloading v${s.version}${
				typeof s.progress === "number"
					? ` — ${Math.round(s.progress * 100)}%`
					: ""
			}`;
		case "ready":
			return `v${s.version} is downloaded and waiting. Restart to install.`;
		case "error":
			return s.message;
	}
}

export function AboutPane() {
	const copyBuildId = () => {
		navigator.clipboard?.writeText(__BUILD_ID__).catch(() => {});
	};
	const updater = useStore($updaterState);
	const isBusy = () =>
		updater().kind === "checking" || updater().kind === "downloading";
	return (
		<Pane
			eyebrow="About"
			title="Navidrome Client"
			description='A "Cinematic Native" desktop client for Navidrome and Subsonic. Built with Electrobun + SolidJS.'
		>
			<Section title="Build">
				<Row title="Build ID" hint="Click to copy. Include this in bug reports.">
					<button type="button" class={styles.button} onClick={copyBuildId}>
						<code>{__BUILD_ID__}</code>
					</button>
				</Row>
			</Section>

			<Section title="Updates">
				<Row title="Status" hint={updaterHint(updater())}>
					<Show
						when={updater().kind === "ready"}
						fallback={
							<button
								type="button"
								class={styles.button}
								disabled={isBusy()}
								onClick={() => void triggerUpdateCheck()}
							>
								<RefreshCw
									size={14}
									style={
										isBusy()
											? { animation: "spin 1s linear infinite" }
											: undefined
									}
								/>
								{isBusy() ? "Checking…" : "Check for updates"}
							</button>
						}
					>
						<button
							type="button"
							class={styles.button}
							onClick={() => void applyUpdateNow()}
						>
							Restart to install
						</button>
					</Show>
				</Row>
			</Section>

			<Section title="Links">
				<Row title="Source" hint="github.com/kravetsone/navidrome-client">
					<a
						class={styles.button}
						href="https://github.com/kravetsone/navidrome-client"
						target="_blank"
						rel="noreferrer"
					>
						GitHub
					</a>
				</Row>
				<Row title="Navidrome" hint="The server side of this client.">
					<a
						class={styles.button}
						href="https://www.navidrome.org/"
						target="_blank"
						rel="noreferrer"
					>
						navidrome.org
					</a>
				</Row>
			</Section>
		</Pane>
	);
}
