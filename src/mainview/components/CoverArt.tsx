import {
	Show,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	untrack,
} from "solid-js";
import { gradientFor, initialsFor } from "../lib/color";
import styles from "./CoverArt.module.css";

interface CoverArtProps {
	src?: string;
	fallbackSrc?: string;
	/**
	 * Optional instant poster painted underneath while `src` decodes. Only used
	 * if we've already rendered this URL (any size) earlier in the session —
	 * otherwise painting it would just trigger the same network roundtrip we're
	 * trying to avoid. Canonical example: playing a song → song.coverArt differs
	 * from album.coverArt, but the user just viewed the album, so we pass the
	 * album's cover URL here and it cross-fades into the song's cover when ready.
	 */
	posterSrc?: string;
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

function cachedVariant(url: string | undefined): string | undefined {
	if (!url) return undefined;
	if (loadedUrls.has(url)) return url;
	const cached = loadedByLogicalKey.get(logicalKey(url));
	return cached && cached !== url ? cached : undefined;
}

function pickPoster(
	target: string,
	explicit: string | undefined,
): string | undefined {
	const selfVariant = cachedVariant(target);
	if (selfVariant) return selfVariant;
	if (!explicit) return undefined;
	return cachedVariant(explicit);
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

	// Two-layer render: `poster` paints underneath instantly from cache when we
	// have a bridge URL, `active` is the real target — hidden (opacity:0) while
	// decoding, cross-fades in on load. When there's no poster we keep the
	// active layer fully opaque so the browser's native old-src→new-src handoff
	// takes over (otherwise we'd blank the art during a song change).
	const [poster, setPoster] = createSignal<string | undefined>();
	const [active, setActive] = createSignal<string | undefined>();
	const [activeReady, setActiveReady] = createSignal(false);

	createEffect(() => {
		const t = target();
		if (!t) {
			setPoster(undefined);
			setActive(undefined);
			setActiveReady(false);
			return;
		}
		if (loadedUrls.has(t)) {
			setPoster(undefined);
			setActive(t);
			setActiveReady(true);
			return;
		}
		const p = pickPoster(t, props.posterSrc);
		if (p) {
			// Explicit cross-fade path — poster paints first, target fades in
			// over it when its offscreen preload resolves.
			setPoster(p);
			setActive(t);
			setActiveReady(false);
			const img = new Image();
			let cancelled = false;
			img.decoding = "async";
			img.onload = () => {
				if (cancelled) return;
				recordLoaded(t);
				setActiveReady(true);
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
			return;
		}
		// No poster to bridge with. If we were already painting something,
		// keep the active layer fully opaque so the browser shows the previous
		// image until the new src decodes (native <img> src-swap behaviour).
		// On a true cold start (first mount, never painted) fade in from 0.
		const wasPainted = untrack(() => active() !== undefined);
		setPoster(undefined);
		setActive(t);
		setActiveReady(wasPainted);
	});

	const handleActiveLoad = () => {
		const a = active();
		if (!a) return;
		recordLoaded(a);
		setActiveReady(true);
	};

	const handleActiveError = () => {
		const a = active();
		if (!a) return;
		setFailed((prev) => {
			if (prev.has(a)) return prev;
			const next = new Set(prev);
			next.add(a);
			return next;
		});
	};

	const handlePosterLoad = () => {
		const p = poster();
		if (p) recordLoaded(p);
	};

	const fontSize = () => Math.max(14, (props.size ?? 180) * 0.28);

	const hasAnything = () => Boolean(poster() || active());

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
			<Show when={poster()}>
				<img
					class={`${styles.image} ${styles.poster}`}
					src={poster()!}
					alt=""
					aria-hidden="true"
					decoding="async"
					draggable={false}
					onLoad={handlePosterLoad}
				/>
			</Show>

			<Show when={active()}>
				<img
					class={`${styles.image} ${styles.active}`}
					src={active()!}
					alt={props.name}
					loading="lazy"
					decoding="async"
					draggable={false}
					onLoad={handleActiveLoad}
					onError={handleActiveError}
					data-ready={activeReady() ? "true" : "false"}
				/>
			</Show>

			<Show when={!hasAnything()}>
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
