import {
	Play,
	SkipBack,
	SkipForward,
	Shuffle,
	Repeat,
	Volume2,
	ListMusic,
} from "lucide-solid";
import styles from "./PlayerBar.module.css";

export function PlayerBar() {
	return (
		<div class={styles.player}>
			<div class={styles.track}>
				<div class={styles.art} />
				<div class={styles.trackText}>
					<span class={styles.trackMuted}>Nothing playing</span>
				</div>
			</div>

			<div class={styles.controls}>
				<div class={styles.buttons}>
					<button class={styles.btn} aria-label="Shuffle">
						<Shuffle />
					</button>
					<button class={styles.btn} aria-label="Previous">
						<SkipBack />
					</button>
					<button class={`${styles.btn} ${styles.play}`} aria-label="Play">
						<Play fill="currentColor" />
					</button>
					<button class={styles.btn} aria-label="Next">
						<SkipForward />
					</button>
					<button class={styles.btn} aria-label="Repeat">
						<Repeat />
					</button>
				</div>
				<div class={styles.progress}>
					<span class={styles.time}>0:00</span>
					<div class={styles.bar}>
						<div class={styles.barFill} />
					</div>
					<span class={styles.time}>0:00</span>
				</div>
			</div>

			<div class={styles.meta}>
				<button class={styles.btn} aria-label="Queue">
					<ListMusic />
				</button>
				<div class={styles.volume}>
					<Volume2 size={16} style={{ color: "var(--text-tertiary)" }} />
					<div class={styles.volumeBar}>
						<div class={styles.volumeFill} />
					</div>
				</div>
			</div>
		</div>
	);
}
