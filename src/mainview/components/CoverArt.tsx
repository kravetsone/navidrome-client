import { createSignal, Show } from "solid-js";
import { gradientFor, initialsFor } from "../lib/color";
import styles from "./CoverArt.module.css";

interface CoverArtProps {
	src?: string;
	name: string;
	round?: boolean;
	size?: number;
	class?: string;
}

export function CoverArt(props: CoverArtProps) {
	const [loaded, setLoaded] = createSignal(false);
	const [failed, setFailed] = createSignal(false);

	const showImage = () => Boolean(props.src) && !failed();
	const fontSize = () => Math.max(14, (props.size ?? 180) * 0.28);

	return (
		<div
			class={`${styles.cover} ${props.round ? styles.round : ""} ${props.class ?? ""}`}
			style={{
				background: gradientFor(props.name),
				...(props.size ? { width: `${props.size}px`, height: `${props.size}px` } : {}),
			}}
		>
			<Show when={!loaded() && showImage()}>
				<div class={styles.skeleton} />
			</Show>
			<Show when={showImage()}>
				<img
					class={styles.image}
					src={props.src}
					alt={props.name}
					data-loaded={loaded()}
					loading="lazy"
					draggable={false}
					onLoad={() => setLoaded(true)}
					onError={() => setFailed(true)}
				/>
			</Show>
			<Show when={!showImage()}>
				<span class={styles.fallback} style={{ "font-size": `${fontSize()}px` }}>
					{initialsFor(props.name)}
				</span>
			</Show>
		</div>
	);
}
