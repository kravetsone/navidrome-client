import { atom } from "nanostores";

export const $paletteOpen = atom(false);

export const openPalette = () => $paletteOpen.set(true);
export const closePalette = () => $paletteOpen.set(false);
export const togglePalette = () => $paletteOpen.set(!$paletteOpen.get());
