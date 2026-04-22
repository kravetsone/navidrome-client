export function hashHue(input: string): number {
	let h = 0;
	for (let i = 0; i < input.length; i++) {
		h = (h << 5) - h + input.charCodeAt(i);
		h |= 0;
	}
	return Math.abs(h) % 360;
}

export function gradientFor(seed: string): string {
	const hue = hashHue(seed);
	const h2 = (hue + 40) % 360;
	return `linear-gradient(135deg, hsl(${hue} 55% 26%), hsl(${h2} 45% 14%))`;
}

export function initialsFor(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
	return ((parts[0]![0] ?? "") + (parts[1]![0] ?? "")).toUpperCase();
}
