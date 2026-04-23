import { Pane, Row, Section } from "../primitives/controls";
import styles from "../primitives/controls.module.css";

export function AboutPane() {
	const copyBuildId = () => {
		navigator.clipboard?.writeText(__BUILD_ID__).catch(() => {});
	};
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
