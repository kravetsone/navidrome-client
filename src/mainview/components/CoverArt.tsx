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

// Exact URLs we've painted at least once this session. Re-mounting with
// one of these skips the skeleton and the fade-in.
const loadedUrls = new Set<string>();
// URLs keyed by identity ignoring the `size` query param. Lets a cached
// low-res variant stand in as an instant poster while a higher-res variant
// preloads on top (e.g. 240px grid avatar → 360px detail hero).
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

function posterFor(url: string | undefined): string | undefined {
	if (!url) return undefined;
	if (loadedUrls.has(url)) return url;
	return loadedByLogicalKey.get(logicalKey(url));
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

	// The URL actually being painted. Starts as a size-agnostic poster when
	// available so nav into a detail page reuses the grid's avatar instantly.
	const [displayed, setDisplayed] = createSignal<string | undefined>(
		posterFor(candidates()[0]),
	);
	// Whether the first painted URL came from cache. Drives a one-shot fade
	// for fresh network loads, suppressed for cache hits.
	const [instant, setInstant] = createSignal<boolean>(
		Boolean(posterFor(candidates()[0])),
	);

	createEffect(() => {
		const t = target();
		if (!t || displayed()) return;
		const poster = posterFor(t);
		if (poster) setDisplayed(poster);
	});

	// Preload target in an offscreen Image(); swap `displayed` on success,
	// mark the URL failed on error so the next candidate gets a turn.
	createEffect(() => {
		const t = target();
		if (!t || t === displayed()) return;
		const img = new Image();
		let cancelled = false;
		img.decoding = "async";
		img.onload = () => {
			if (cancelled) return;
			const first = !displayed();
			recordLoaded(t);
			if (first) setInstant(false);
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

	const fontSize = () => Math.max(14, (props.size ?? 180) * 0.28);
	const showSkeleton = () => !displayed() && Boolean(target());

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
			<Show when={showSkeleton()}>
				<div class={styles.skeleton} />
			</Show>

			<Show when={displayed()}>
				<img
					class={styles.image}
					src={displayed()!}
					alt={props.name}
					decoding="async"
					draggable={false}
					data-instant={instant() ? "true" : "false"}
				/>
			</Show>

			<Show when={!target() && !displayed()}>
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
