import { Vibrant } from "node-vibrant/browser";

const DEFAULT_PRIMARY = "var(--accent)";
const DEFAULT_SECONDARY = "var(--accent)";

export interface AmbientPalette {
	primary: string;
	secondary: string;
}

const promiseCache = new Map<string, Promise<AmbientPalette | null>>();
const syncCache = new Map<string, AmbientPalette | null>();

export function getAmbientPaletteSync(
	url: string,
): AmbientPalette | null | undefined {
	return syncCache.get(url);
}

export async function extractAmbientPalette(
	url: string,
): Promise<AmbientPalette | null> {
	const cached = promiseCache.get(url);
	if (cached) return cached;
	const task = (async () => {
		try {
			const palette = await Vibrant.from(url).getPalette();
			const primary =
				palette.Vibrant?.hex ??
				palette.LightVibrant?.hex ??
				palette.DarkVibrant?.hex ??
				palette.Muted?.hex ??
				null;
			const secondary =
				palette.DarkVibrant?.hex ??
				palette.DarkMuted?.hex ??
				palette.Muted?.hex ??
				primary;
			if (!primary || !secondary) {
				syncCache.set(url, null);
				return null;
			}
			const result: AmbientPalette = { primary, secondary };
			syncCache.set(url, result);
			return result;
		} catch {
			syncCache.set(url, null);
			return null;
		}
	})();
	promiseCache.set(url, task);
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
