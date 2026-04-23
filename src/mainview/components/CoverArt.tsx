import { Show, createMemo, createSignal } from "solid-js";
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

// URLs we've painted at least once this session. Lets re-mounts (or a later
// render of the same URL at a different size) skip the fade-in so navigation
// feels instant.
const loadedUrls = new Set<string>();
const loadedByLogicalKey = new Set<string>();

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
	loadedByLogicalKey.add(logicalKey(url));
}

function isCached(url: string | undefined): boolean {
	if (!url) return false;
	if (loadedUrls.has(url)) return true;
	return loadedByLogicalKey.has(logicalKey(url));
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

	const handleLoad = () => {
		const t = target();
		if (t) recordLoaded(t);
	};

	const handleError = () => {
		const t = target();
		if (!t) return;
		setFailed((prev) => {
			if (prev.has(t)) return prev;
			const next = new Set(prev);
			next.add(t);
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
			<Show when={target()}>
				<img
					class={styles.image}
					src={target()!}
					alt={props.name}
					loading="lazy"
					decoding="async"
					draggable={false}
					onLoad={handleLoad}
					onError={handleError}
					data-instant={isCached(target()) ? "true" : "false"}
				/>
			</Show>

			<Show when={!target()}>
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
