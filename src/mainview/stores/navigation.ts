import { atom, map } from "nanostores";

const stack: string[] = [];
const scrolls: number[] = [];
let idx = -1;

export const $canBack = atom(false);
export const $canForward = atom(false);

function sync() {
	$canBack.set(idx > 0);
	$canForward.set(idx >= 0 && idx < stack.length - 1);
}

let scrollEl: HTMLElement | null = null;
let rafPending = false;
// Per-path memory survives beyond the live stack. Re-entering a path via
// the sidebar (a fresh push, not back/forward) still restores its last
// known scroll position.
const scrollByPath = new Map<string, number>();

function captureCurrentScroll() {
	if (!scrollEl || idx < 0) return;
	const y = scrollEl.scrollTop;
	scrolls[idx] = y;
	scrollByPath.set(stack[idx], y);
}

function onScroll() {
	if (rafPending) return;
	rafPending = true;
	requestAnimationFrame(() => {
		rafPending = false;
		captureCurrentScroll();
	});
}

export function registerScrollContainer(el: HTMLElement) {
	if (scrollEl === el) return;
	if (scrollEl) scrollEl.removeEventListener("scroll", onScroll);
	scrollEl = el;
	el.addEventListener("scroll", onScroll, { passive: true });
}

function restoreScroll(target: number) {
	if (!scrollEl) return;
	const el = scrollEl;
	el.scrollTop = target;
	let attempts = 0;
	const tick = () => {
		if (!scrollEl || scrollEl !== el) return;
		if (Math.abs(el.scrollTop - target) > 1 && el.scrollHeight > el.clientHeight) {
			el.scrollTop = target;
		}
		attempts++;
		if (attempts < 6 && Math.abs(el.scrollTop - target) > 1) {
			requestAnimationFrame(tick);
		}
	};
	requestAnimationFrame(tick);
}

export function trackLocation(path: string) {
	if (idx >= 0 && stack[idx] === path) return;
	// Snapshot the leaving entry's scroll before moving idx.
	captureCurrentScroll();
	let target = 0;
	if (idx > 0 && stack[idx - 1] === path) {
		idx--;
		target = scrolls[idx] ?? 0;
	} else if (idx < stack.length - 1 && stack[idx + 1] === path) {
		idx++;
		target = scrolls[idx] ?? 0;
	} else {
		stack.length = idx + 1;
		scrolls.length = idx + 1;
		stack.push(path);
		target = scrollByPath.get(path) ?? 0;
		scrolls.push(target);
		idx = stack.length - 1;
	}
	sync();
	restoreScroll(target);
}

// Paths whose ?search state should be restored when re-entered via sidebar.
const PARAM_MEMORY_PATHS = new Set([
	"/albums",
	"/artists",
	"/playlists",
	"/favorites",
	"/recent",
	"/search",
]);

export const $lastSearchByPath = map<Record<string, string>>({});

export function rememberSearch(pathname: string, search: string) {
	if (!PARAM_MEMORY_PATHS.has(pathname)) return;
	if ($lastSearchByPath.get()[pathname] === search) return;
	$lastSearchByPath.setKey(pathname, search);
}
