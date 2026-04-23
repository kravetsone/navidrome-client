import { Vibrant } from "node-vibrant/browser";

const DEFAULT_PRIMARY = "var(--accent)";
const DEFAULT_SECONDARY = "var(--accent)";

export interface AmbientPalette {
	primary: string;
	secondary: string;
}

const cache = new Map<string, Promise<AmbientPalette | null>>();

export async function extractAmbientPalette(
	url: string,
): Promise<AmbientPalette | null> {
	const cached = cache.get(url);
	if (cached) return cached;
	const task = (async () => {
		try {
			const palette = await Vibrant.from(url).getPalette();
			const primary =
				palette.Vibrant?.hex ??
				palette.DarkVibrant?.hex ??
				palette.Muted?.hex ??
				null;
			const secondary =
				palette.DarkMuted?.hex ??
				palette.DarkVibrant?.hex ??
				palette.Muted?.hex ??
				primary;
			if (!primary || !secondary) return null;
			return { primary, secondary };
		} catch {
			return null;
		}
	})();
	cache.set(url, task);
	return task;
}

export function applyAmbientPalette(p: AmbientPalette): void {
	const root = document.documentElement;
	root.style.setProperty("--ambient-primary", p.primary);
	root.style.setProperty("--ambient-secondary", p.secondary);
}

export function resetAmbientPalette(): void {
	const root = document.documentElement;
	root.style.setProperty("--ambient-primary", DEFAULT_PRIMARY);
	root.style.setProperty("--ambient-secondary", DEFAULT_SECONDARY);
}
