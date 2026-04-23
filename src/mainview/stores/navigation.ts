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

// Opt out of the browser's own scroll restoration — we manage it ourselves.
if (typeof history !== "undefined" && "scrollRestoration" in history) {
	try {
		history.scrollRestoration = "manual";
	} catch {
		// Some webviews throw; ignore.
	}
}

let scrollEl: HTMLElement | null = null;
let rafPending = false;
// While a programmatic restore is in progress, skip capturing scroll —
// the browser may clamp scrollTop against intermediate (short) content
// heights, and we don't want those intermediate values to overwrite the
// real last-known position.
let restoring = false;
let cancelRestore: (() => void) | null = null;

// Per-path memory survives beyond the live stack. Re-entering a path via
// the sidebar (a fresh push, not back/forward) still restores its last
// known scroll position.
const scrollByPath = new Map<string, number>();

function captureCurrentScroll() {
	if (!scrollEl || idx < 0 || restoring) return;
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

	// Cancel any in-flight restore from a previous navigation.
	if (cancelRestore) cancelRestore();

	if (target <= 0) {
		el.scrollTop = 0;
		return;
	}

	restoring = true;
	const start = performance.now();
	let rafId = 0;
	let done = false;

	const finish = () => {
		if (done) return;
		done = true;
		restoring = false;
		if (rafId) cancelAnimationFrame(rafId);
		if (cancelRestore === cancel) cancelRestore = null;
	};
	const cancel = () => finish();

	const tick = () => {
		if (done) return;
		if (!scrollEl || scrollEl !== el) return finish();
		const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
		if (maxScroll >= target) {
			el.scrollTop = target;
			return finish();
		}
		// Content isn't tall enough yet. Park at the bottom of what we have
		// so the view feels roughly right while async content streams in,
		// and keep polling until scrollHeight catches up or we give up.
		el.scrollTop = maxScroll;
		if (performance.now() - start > 1500) return finish();
		rafId = requestAnimationFrame(tick);
	};

	cancelRestore = cancel;
	rafId = requestAnimationFrame(tick);
}

export function trackLocation(path: string) {
	if (idx >= 0 && stack[idx] === path) return;
	// Don't re-read scrollTop here: by the time this runs, Solid may have
	// already swapped the route's children, and the browser may have
	// clamped scrollTop against shorter incoming content. The live rAF
	// scroll listener already keeps scrolls[idx] fresh (within one frame
	// of the user's last scroll), so we trust that value.
	let target = 0;
	if (idx > 0 && stack[idx - 1] === path) {
		idx--;
		target = scrolls[idx] ?? scrollByPath.get(path) ?? 0;
	} else if (idx < stack.length - 1 && stack[idx + 1] === path) {
		idx++;
		target = scrolls[idx] ?? scrollByPath.get(path) ?? 0;
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
