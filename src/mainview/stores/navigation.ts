import { atom, map } from "nanostores";

const stack: string[] = [];
let idx = -1;

export const $canBack = atom(false);
export const $canForward = atom(false);

function sync() {
	$canBack.set(idx > 0);
	$canForward.set(idx >= 0 && idx < stack.length - 1);
}

export function trackLocation(path: string) {
	if (idx >= 0 && stack[idx] === path) return;
	if (idx > 0 && stack[idx - 1] === path) {
		idx--;
	} else if (idx < stack.length - 1 && stack[idx + 1] === path) {
		idx++;
	} else {
		stack.length = idx + 1;
		stack.push(path);
		idx = stack.length - 1;
	}
	sync();
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
