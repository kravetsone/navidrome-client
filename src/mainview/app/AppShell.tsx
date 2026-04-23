import { onMount, type JSX } from "solid-js";
import { Sidebar } from "./Sidebar";
import { PlayerBar } from "./PlayerBar";
import { CommandPalette } from "../features/search/CommandPalette";
import { NowPlayingView } from "../features/now-playing/NowPlayingView";
import { QueuePanel } from "../features/queue/QueuePanel";
import { audioEngine } from "../lib/player/engine";
import styles from "./AppShell.module.css";

export function AppShell(props: { children: JSX.Element }) {
	let audioRef: HTMLAudioElement | undefined;
	onMount(() => {
		if (audioRef) audioEngine.attach(audioRef);
	});
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
			<CommandPalette />
			<NowPlayingView />
			<QueuePanel />
			<audio ref={audioRef} style={{ display: "none" }} />
		</div>
	);
}
