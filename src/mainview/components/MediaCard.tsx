import { Show } from "solid-js";
import { A } from "@solidjs/router";
import { CoverArt } from "./CoverArt";
import styles from "./MediaCard.module.css";

interface MediaCardProps {
	href: string;
	title: string;
	subtitle?: string;
	meta?: string;
	coverSrc?: string;
	round?: boolean;
}

export function MediaCard(props: MediaCardProps) {
	return (
		<A href={props.href} class={styles.card} data-round={props.round}>
			<CoverArt
				src={props.coverSrc}
				name={props.title}
				round={props.round}
				class={styles.cover}
			/>
			<div class={styles.text}>
				<span class={styles.title}>{props.title}</span>
				<Show when={props.subtitle}>
					<span class={styles.subtitle}>{props.subtitle}</span>
				</Show>
				<Show when={props.meta}>
					<span class={styles.meta}>{props.meta}</span>
				</Show>
			</div>
		</A>
	);
}
