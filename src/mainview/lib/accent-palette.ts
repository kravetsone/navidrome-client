import type { AccentName, AppearancePrefs } from "../stores/preferences";
import { $appearance } from "../stores/preferences";

export interface AccentSwatch {
	name: AccentName;
	label: string;
	base: string;
	hover: string;
	active: string;
}

/**
 * Palette swatches. `gold` matches the current hardcoded default exactly so
 * switching onto a fresh install (which will default to `gold`) is a no-op
 * against the existing `tokens/colors.css` values.
 */
export const ACCENT_SWATCHES: Record<Exclude<AccentName, "custom">, AccentSwatch> = {
	gold: { name: "gold", label: "Gold", base: "#e8b86a", hover: "#f0c57e", active: "#d9a64f" },
	blue: { name: "blue", label: "Azure", base: "#6aa9e8", hover: "#7eb5f0", active: "#4f93d9" },
	purple: {
		name: "purple",
		label: "Orchid",
		base: "#c58ae8",
		hover: "#d29cf0",
		active: "#b074d9",
	},
	green: { name: "green", label: "Sage", base: "#7ecf99", hover: "#8fd7a7", active: "#66bf85" },
	pink: { name: "pink", label: "Rose", base: "#e87e9e", hover: "#f090af", active: "#d96685" },
};

export function accentSwatch(name: AccentName, customHex: string): AccentSwatch {
	if (name === "custom") {
		return {
			name: "custom",
			label: "Custom",
			base: customHex,
			hover: customHex,
			active: customHex,
		};
	}
	return ACCENT_SWATCHES[name];
}

/**
 * Apply accent tokens to the document root. Sets the five accent CSS custom
 * properties that components pick up — unsetting reverts to the values
 * declared in tokens/colors.css.
 */
export function applyAccent(a: AppearancePrefs): void {
	const root = document.documentElement;
	const sw = accentSwatch(a.accent, a.customAccent);
	root.style.setProperty("--accent", sw.base);
	root.style.setProperty("--accent-hover", sw.hover);
	root.style.setProperty("--accent-active", sw.active);
	// --accent-glow is semi-transparent in the source; derive via rgba from
	// the base hex so custom colors look consistent with the gold default.
	root.style.setProperty("--accent-glow", hexToRgba(sw.base, 0.18));
	// --ring-focus uses color-mix in tokens/colors.css; setting --accent is
	// enough since color-mix resolves against it.
}

/**
 * Apply appearance toggles that live as root attributes (consumed by CSS
 * selectors). Kept here so every appearance-related side-effect is in one
 * place.
 */
export function applyAppearance(a: AppearancePrefs): void {
	const root = document.documentElement;
	applyAccent(a);
	root.dataset.density = a.density;
	if (a.reduceMotion) root.dataset.reduceMotion = "true";
	else delete root.dataset.reduceMotion;
	if (a.ambientBackground) delete root.dataset.ambient;
	else root.dataset.ambient = "off";
}

/**
 * Wire `$appearance` to live-apply. Call once during boot after the
 * preferences store is hydrated.
 */
export function installAppearanceEffect(): void {
	applyAppearance($appearance.get());
	$appearance.subscribe((a) => applyAppearance(a));
}

function hexToRgba(hex: string, alpha: number): string {
	const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
	if (!m) return `rgba(232, 184, 106, ${alpha})`;
	const n = parseInt(m[1]!, 16);
	const r = (n >> 16) & 0xff;
	const g = (n >> 8) & 0xff;
	const b = n & 0xff;
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
