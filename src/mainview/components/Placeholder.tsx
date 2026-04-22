import type { JSX } from "solid-js";
import styles from "./Placeholder.module.css";

export function Placeholder(props: {
	icon: JSX.Element;
	title: string;
	description: string;
}) {
	return (
		<div class={styles.placeholder}>
			<div class={styles.inner}>
				<div class={styles.icon}>{props.icon}</div>
				<h2 class={styles.title}>{props.title}</h2>
				<p class={styles.description}>{props.description}</p>
			</div>
		</div>
	);
}
