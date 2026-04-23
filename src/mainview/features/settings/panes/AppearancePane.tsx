import { useStore } from "@nanostores/solid";
import { Pane, Row, Section, SwatchPicker, Segmented, Toggle } from "../primitives/controls";
import { $appearance, setPref } from "../../../stores/preferences";

export function AppearancePane() {
	const a = useStore($appearance);
	return (
		<Pane
			eyebrow="Settings"
			title="Appearance"
			description="Make it yours. Accent ripples through every button, focus ring, and active-track glow."
		>
			<Section title="Theme">
				<Row title="Accent color" hint="Drives buttons, highlights, focus rings.">
					<SwatchPicker
						value={a().accent}
						customHex={a().customAccent}
						onChange={(name, hex) => {
							if (hex !== a().customAccent) setPref("appearance", "customAccent", hex);
							setPref("appearance", "accent", name);
						}}
					/>
				</Row>
				<Row
					title="Density"
					hint="Comfortable breathes. Compact fits more on screen."
				>
					<Segmented
						value={a().density}
						onChange={(v) => setPref("appearance", "density", v)}
						options={[
							{ value: "comfortable", label: "Comfortable" },
							{ value: "compact", label: "Compact" },
						]}
					/>
				</Row>
			</Section>

			<Section title="Motion & Background">
				<Row
					title="Ambient background"
					hint="Album-art-tinted gradient behind the main view."
				>
					<Toggle
						checked={a().ambientBackground}
						onChange={(v) => setPref("appearance", "ambientBackground", v)}
					/>
				</Row>
				<Row
					title="Reduce motion"
					hint="Disables transitions, animations, and palette crossfades."
				>
					<Toggle
						checked={a().reduceMotion}
						onChange={(v) => setPref("appearance", "reduceMotion", v)}
					/>
				</Row>
			</Section>
		</Pane>
	);
}
