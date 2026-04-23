import { For, Show } from "solid-js";
import { useStore } from "@nanostores/solid";
import { Pane, Row, Section, Segmented } from "../primitives/controls";
import styles from "../primitives/controls.module.css";
import { $playback, setPref } from "../../../stores/preferences";
import { QUALITY_DESCRIPTORS } from "../../../lib/player/stream-quality";

export function StreamingPane() {
	const p = useStore($playback);
	return (
		<Pane
			eyebrow="Settings"
			title="Streaming"
			description="Pick a quality tier — we handle the rest. Power users can drop into Custom for direct control over codec and bitrate."
		>
			<Section title="Quality">
				<div class={styles.qualityGrid}>
					<For each={QUALITY_DESCRIPTORS}>
						{(q) => (
							<button
								type="button"
								class={styles.qualityCard}
								data-selected={p().streamQuality === q.key ? "true" : undefined}
								onClick={() => setPref("playback", "streamQuality", q.key)}
							>
								<span class={styles.qualityLabel}>{q.label}</span>
								<span class={styles.qualityTagline}>{q.tagline}</span>
								<span class={styles.qualityHint}>{q.hint}</span>
							</button>
						)}
					</For>
				</div>

				<Show when={p().streamQuality === "custom"}>
					<div class={styles.customAccordion}>
						<Row title="Format" hint="Raw streams the source file; others transcode on the fly.">
							<Segmented
								value={p().transcodeFormat}
								onChange={(v) => setPref("playback", "transcodeFormat", v)}
								options={[
									{ value: "raw", label: "Raw" },
									{ value: "mp3", label: "MP3" },
									{ value: "opus", label: "Opus" },
								]}
							/>
						</Row>
						<Row
							title="Max bitrate"
							hint="Caps the transcode target. Ignored when Format is Raw."
						>
							<Segmented<0 | 96 | 128 | 192 | 256 | 320>
								value={p().maxBitrate}
								onChange={(v) => setPref("playback", "maxBitrate", v)}
								options={[
									{ value: 96, label: "96" },
									{ value: 128, label: "128" },
									{ value: 192, label: "192" },
									{ value: 256, label: "256" },
									{ value: 320, label: "320" },
									{ value: 0, label: "Unlimited" },
								]}
							/>
						</Row>
					</div>
				</Show>
			</Section>
		</Pane>
	);
}
