import { atom } from "nanostores";

export interface LightboxContent {
	url: string;
	name: string;
}

export const $lightbox = atom<LightboxContent | null>(null);

export function openLightbox(url: string | undefined, name: string): void {
	if (!url) return;
	$lightbox.set({ url, name });
}

export function closeLightbox(): void {
	$lightbox.set(null);
}
