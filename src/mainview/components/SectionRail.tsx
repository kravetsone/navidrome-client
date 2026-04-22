import { type JSX, Show } from "solid-js";
import { A } from "@solidjs/router";
import styles from "./SectionRail.module.css";

interface SectionRailProps {
	eyebrow?: string;
	title: string;
	moreHref?: string;
	children: JSX.Element;
}

export function SectionRail(props: SectionRailProps) {
	return (
		<section class={styles.section}>
			<header class={styles.header}>
				<div class={styles.titleGroup}>
					<Show when={props.eyebrow}>
						<span class={styles.eyebrow}>{props.eyebrow}</span>
					</Show>
					<h2 class={styles.title}>{props.title}</h2>
				</div>
				<Show when={props.moreHref}>
					<A href={props.moreHref!} class={styles.link}>
						See all
					</A>
				</Show>
			</header>
			<div class={styles.rail}>{props.children}</div>
		</section>
	);
}
