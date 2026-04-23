import { onMount, type JSX } from "solid-js";
import { Sidebar } from "./Sidebar";
import { PlayerBar } from "./PlayerBar";
import { CommandPalette } from "../features/search/CommandPalette";
import { SearchPill } from "../features/search/SearchPill";
import { NowPlayingView } from "../features/now-playing/NowPlayingView";
import { QueuePanel } from "../features/queue/QueuePanel";
import { LightboxView } from "../features/lightbox/LightboxView";
import { ToastViewport } from "../components/Toast";
import { audioEngine } from "../lib/player/engine";
import { installShortcuts } from "../lib/shortcuts";
import styles from "./AppShell.module.css";

export function AppShell(props: { children: JSX.Element }) {
	let audioRef: HTMLAudioElement | undefined;
	onMount(() => {
		if (audioRef) audioEngine.attach(audioRef);
	});
	installShortcuts();
	return (
		<div class={styles.shell}>
			<div class={styles.ambient} />
			<aside class={styles.sidebar}>
				<Sidebar />
			</aside>
			<section class={styles.main}>
				<div class={styles.titlebar}>
					<SearchPill />
				</div>
				<div class={styles.content}>{props.children}</div>
			</section>
			<footer class={styles.player}>
				<PlayerBar />
			</footer>
			<CommandPalette />
			<NowPlayingView />
			<QueuePanel />
			<LightboxView />
			<ToastViewport />
			<audio ref={audioRef} style={{ display: "none" }} />
		</div>
	);
}
