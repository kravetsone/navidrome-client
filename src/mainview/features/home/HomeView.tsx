import { A } from "@solidjs/router";
import { ArrowRight } from "lucide-solid";
import styles from "./HomeView.module.css";

export function HomeView() {
	return (
		<div class={styles.home}>
			<div class={styles.hero}>
				<div class={styles.orb} />
				<span class={styles.eyebrow}>Welcome</span>
				<h1 class={styles.title}>Your library, beautifully at hand.</h1>
				<p class={styles.subtitle}>
					Connect your Navidrome or Subsonic server to start listening. Everything you
					love — albums, artists, playlists — ready in one quiet place.
				</p>
				<A href="/settings" class={styles.cta}>
					Connect a server
					<ArrowRight />
				</A>
			</div>
		</div>
	);
}
