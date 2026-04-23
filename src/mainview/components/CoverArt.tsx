import { createMemo, createSignal, onMount, Show } from "solid-js";
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

// Tracks URLs that finished loading at least once in this session. Lets us
// skip the fade-in on remount so re-entering a page doesn't flash skeletons
// for images the browser already has in cache.
const loadedSources = new Set<string>();

export function CoverArt(props: CoverArtProps) {
	const sources = createMemo(() =>
		[props.src, props.fallbackSrc].filter((s): s is string => Boolean(s)),
	);
	const currentSrc = () => sources()[tier()];
	const [tier, setTier] = createSignal(0);
	const [loaded, setLoaded] = createSignal(
		(() => {
			const s = sources()[0];
			return s ? loadedSources.has(s) : false;
		})(),
	);

	const fontSize = () => Math.max(14, (props.size ?? 180) * 0.28);

	let imgEl: HTMLImageElement | undefined;
	onMount(() => {
		if (!imgEl || loaded()) return;
		if (imgEl.complete && imgEl.naturalWidth > 0) {
			const src = imgEl.currentSrc || imgEl.src;
			if (src) loadedSources.add(src);
			setLoaded(true);
		}
	});

	return (
		<div
			class={`${styles.cover} ${props.round ? styles.round : ""} ${props.class ?? ""}`}
			style={{
				background: gradientFor(props.name),
				...(props.size ? { width: `${props.size}px`, height: `${props.size}px` } : {}),
			}}
		>
			<Show when={!loaded() && currentSrc()}>
				<div class={styles.skeleton} />
			</Show>
			<Show when={currentSrc()} keyed>
				{(src) => (
					<img
						ref={imgEl}
						class={styles.image}
						src={src}
						alt={props.name}
						data-loaded={loaded()}
						loading="lazy"
						draggable={false}
						onLoad={() => {
							loadedSources.add(src);
							setLoaded(true);
						}}
						onError={() => {
							setLoaded(false);
							setTier((t) => t + 1);
						}}
					/>
				)}
			</Show>
			<Show when={!currentSrc()}>
				<span class={styles.fallback} style={{ "font-size": `${fontSize()}px` }}>
					{initialsFor(props.name)}
				</span>
			</Show>
		</div>
	);
}
