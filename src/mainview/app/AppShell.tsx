import type { JSX } from "solid-js";
import { Sidebar } from "./Sidebar";
import { PlayerBar } from "./PlayerBar";
import styles from "./AppShell.module.css";

export function AppShell(props: { children: JSX.Element }) {
	return (
		<div class={styles.shell}>
			<div class={styles.ambient} />
			<aside class={styles.sidebar}>
				<Sidebar />
			</aside>
			<section class={styles.main}>
				<div class={styles.titlebar} />
				<div class={styles.content}>{props.children}</div>
			</section>
			<footer class={styles.player}>
				<PlayerBar />
			</footer>
		</div>
	);
}
