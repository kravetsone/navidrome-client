import { $preferences, type PlaybackPrefs } from "../../stores/preferences";

export interface StreamParams {
	format?: string;
	maxBitRate?: number;
}

/**
 * Resolve the user's stream-quality preset into the concrete params passed to
 * the Subsonic `stream` endpoint. See the plan: only the Custom preset reads
 * the raw `transcodeFormat` / `maxBitrate` knobs — other presets are
 * self-contained so switching presets doesn't depend on the custom values
 * happening to be sensible.
 */
export function resolveStreamParams(p: PlaybackPrefs = $preferences.get().playback): StreamParams {
	switch (p.streamQuality) {
		case "auto":
			return { format: "raw" };
		case "low":
			return { format: "opus", maxBitRate: 96 };
		case "medium":
			return { format: "mp3", maxBitRate: 192 };
		case "high":
			return { format: "mp3", maxBitRate: 320 };
		case "custom":
			return {
				format: p.transcodeFormat,
				maxBitRate: p.maxBitrate > 0 ? p.maxBitrate : undefined,
			};
	}
}

export interface QualityDescriptor {
	key: "auto" | "low" | "medium" | "high" | "custom";
	label: string;
	tagline: string;
	hint: string;
}

/**
 * Human-readable descriptors for the preset picker. Kept next to the resolver
 * so the UI can never drift from what the resolver actually does.
 */
export const QUALITY_DESCRIPTORS: QualityDescriptor[] = [
	{ key: "auto", label: "Auto", tagline: "Original", hint: "Stream the source file" },
	{ key: "low", label: "Low", tagline: "Opus · 96 kbps", hint: "~43 MB / hour" },
	{ key: "medium", label: "Medium", tagline: "MP3 · 192 kbps", hint: "~86 MB / hour" },
	{ key: "high", label: "High", tagline: "MP3 · 320 kbps", hint: "~144 MB / hour" },
	{ key: "custom", label: "Custom", tagline: "Advanced", hint: "Pick codec + bitrate" },
];
