import {
	Show,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
} from "solid-js";
import { gradientFor, initialsFor } from "../lib/color";
import styles from "./CoverArt.module.css";

interface CoverArtProps {
	src?: string;
	fallbackSrc?: string;
	name: string;
	round?: boolean;
	size?: number;
	class?: string;
}

const loadedUrls = new Set<string>();
const loadedByLogicalKey = new Map<string, string>();

function logicalKey(url: string): string {
	try {
		const u = new URL(url, "http://x");
		u.searchParams.delete("size");
		return u.toString();
	} catch {
		return url;
	}
}

function recordLoaded(url: string) {
	loadedUrls.add(url);
	loadedByLogicalKey.set(logicalKey(url), url);
}

// Any differently-sized variant of this URL we've already painted this session.
// Used as an instant poster when navigating from a grid (240px) into a detail
// view (600px) so the user sees the cached low-res cover immediately.
function posterFor(url: string | undefined): string | undefined {
	if (!url) return undefined;
	if (loadedUrls.has(url)) return url;
	const cached = loadedByLogicalKey.get(logicalKey(url));
	return cached && cached !== url ? cached : undefined;
}

export function CoverArt(props: CoverArtProps) {
	const candidates = createMemo(() =>
		[props.src, props.fallbackSrc].filter((s): s is string => Boolean(s)),
	);

	const [failed, setFailed] = createSignal<Set<string>>(new Set());
	const target = createMemo(() => {
		const bad = failed();
		return candidates().find((c) => !bad.has(c));
	});

	const [displayed, setDisplayed] = createSignal<string | undefined>(
		(() => {
			const t = target();
			if (!t) return undefined;
			if (loadedUrls.has(t)) return t;
			return posterFor(t);
		})(),
	);

	createEffect(() => {
		const t = target();
		if (!t) {
			setDisplayed(undefined);
			return;
		}
		if (loadedUrls.has(t)) {
			setDisplayed(t);
			return;
		}
		const poster = posterFor(t);
		if (!poster) {
			// No cached variant to bridge with — skip the offscreen Image()
			// preloader and let the visible <img loading="lazy"> fetch it
			// natively. Keeps dense grids (e.g. /artists) cheap on mount.
			setDisplayed(t);
			return;
		}
		// Paint poster instantly, preload target offscreen, swap when ready.
		setDisplayed(poster);
		const img = new Image();
		let cancelled = false;
		img.decoding = "async";
		img.onload = () => {
			if (cancelled) return;
			recordLoaded(t);
			setDisplayed(t);
		};
		img.onerror = () => {
			if (cancelled) return;
			setFailed((prev) => {
				if (prev.has(t)) return prev;
				const next = new Set(prev);
				next.add(t);
				return next;
			});
		};
		img.src = t;
		onCleanup(() => {
			cancelled = true;
		});
	});

	const handleLoad = () => {
		const d = displayed();
		if (d) recordLoaded(d);
	};

	const handleError = () => {
		const d = displayed();
		if (!d) return;
		setFailed((prev) => {
			if (prev.has(d)) return prev;
			const next = new Set(prev);
			next.add(d);
			return next;
		});
	};

	const fontSize = () => Math.max(14, (props.size ?? 180) * 0.28);

	return (
		<div
			class={`${styles.cover} ${props.round ? styles.round : ""} ${props.class ?? ""}`}
			style={{
				background: gradientFor(props.name),
				...(props.size
					? { width: `${props.size}px`, height: `${props.size}px` }
					: {}),
			}}
		>
			<Show when={displayed()}>
				<img
					class={styles.image}
					src={displayed()!}
					alt={props.name}
					loading="lazy"
					decoding="async"
					draggable={false}
					onLoad={handleLoad}
					onError={handleError}
					data-instant={
						loadedUrls.has(displayed()!) ||
						loadedByLogicalKey.has(logicalKey(displayed()!))
							? "true"
							: "false"
					}
				/>
			</Show>

			<Show when={!displayed()}>
				<span
					class={styles.fallback}
					style={{ "font-size": `${fontSize()}px` }}
				>
					{initialsFor(props.name)}
				</span>
			</Show>
		</div>
	);
}
