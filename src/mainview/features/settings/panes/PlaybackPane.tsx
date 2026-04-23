import { useStore } from "@nanostores/solid";
import { Pane, Row, Section, Segmented, Slider, Toggle } from "../primitives/controls";
import { $playback, setPref } from "../../../stores/preferences";
import { $smartRadio, toggleSmartRadio } from "../../../stores/player";

export function PlaybackPane() {
	const p = useStore($playback);
	const smart = useStore($smartRadio);
	return (
		<Pane
			eyebrow="Settings"
			title="Playback"
			description="Tune the audio engine. Defaults work for most libraries — change only if you notice drift or stalls."
		>
			<Section title="Audio engine">
				<Row
					title="Backend"
					hint="Auto picks Web Audio for MP3 (sample-accurate seek), HTML5 otherwise. Override for debugging."
				>
					<Segmented
						value={p().audioBackend}
						onChange={(v) => setPref("playback", "audioBackend", v)}
						options={[
							{ value: "auto", label: "Auto" },
							{ value: "html5", label: "HTML5" },
							{ value: "webaudio", label: "Web Audio" },
						]}
					/>
				</Row>
				<Row
					title="Preload next track"
					hint="Seconds before the current track ends when the next one begins buffering."
					orientation="stack"
				>
					<Slider
						min={3}
						max={30}
						value={p().preloadSeconds}
						onChange={(v) => setPref("playback", "preloadSeconds", v)}
						format={(v) => `${v}s`}
					/>
				</Row>
				<Row
					title="Scrobble threshold"
					hint="How far into a song before it's marked as played."
					orientation="stack"
				>
					<Slider
						min={20}
						max={95}
						step={5}
						value={p().scrobbleThresholdPercent}
						onChange={(v) => setPref("playback", "scrobbleThresholdPercent", v)}
						format={(v) => `${v}%`}
					/>
				</Row>
			</Section>

			<Section title="Radio & Queue">
				<Row
					title="Smart radio"
					hint="When your queue runs low, top up with similar tracks automatically."
				>
					<Toggle checked={smart()} onChange={() => toggleSmartRadio()} />
				</Row>
				<Row
					title="Radio lookahead"
					hint="How many upcoming tracks smart radio tries to keep ready."
				>
					<Segmented<3 | 5 | 8>
						value={p().radioLookahead}
						onChange={(v) => setPref("playback", "radioLookahead", v)}
						options={[
							{ value: 3, label: "3 tracks" },
							{ value: 5, label: "5 tracks" },
							{ value: 8, label: "8 tracks" },
						]}
					/>
				</Row>
			</Section>
		</Pane>
	);
}
