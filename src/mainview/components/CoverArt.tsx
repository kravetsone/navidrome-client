import { createMemo, createSignal, Show } from "solid-js";
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

export function CoverArt(props: CoverArtProps) {
	const [loaded, setLoaded] = createSignal(false);
	const [tier, setTier] = createSignal(0);

	const sources = createMemo(() =>
		[props.src, props.fallbackSrc].filter((s): s is string => Boolean(s)),
	);
	const currentSrc = () => sources()[tier()];
	const fontSize = () => Math.max(14, (props.size ?? 180) * 0.28);

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
						class={styles.image}
						src={src}
						alt={props.name}
						data-loaded={loaded()}
						loading="lazy"
						draggable={false}
						onLoad={() => setLoaded(true)}
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
