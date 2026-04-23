import {
	Show,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
} from "solid-js";
import { Popover } from "@kobalte/core/popover";
import { Moon, MoonStar } from "lucide-solid";
import { useStore } from "@nanostores/solid";
import {
	$sleepTimer,
	cancelSleepTimer,
	setSleepTimerDuration,
	setSleepTimerEndOfTrack,
} from "../stores/sleepTimer";
import { $currentSong } from "../stores/player";
import styles from "./SleepTimerButton.module.css";

const PRESETS = [5, 15, 30, 45, 60, 90];

function formatRemaining(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const m = Math.floor(total / 60);
	const s = total % 60;
	if (m === 0) return `0:${s.toString().padStart(2, "0")}`;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SleepTimerButton() {
	const timer = useStore($sleepTimer);
	const currentSong = useStore($currentSong);
	const [now, setNow] = createSignal(Date.now());

	createEffect(() => {
		const t = timer();
		if (t.kind !== "duration") return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		onCleanup(() => clearInterval(id));
	});

	const label = createMemo(() => {
		const t = timer();
		if (t.kind === "duration") return formatRemaining(t.endsAt - now());
		if (t.kind === "endOfTrack") return "End of track";
		return null;
	});

	const isActive = () => timer().kind !== "off";

	return (
		<Popover gutter={8} placement="top">
			<Popover.Trigger
				class={styles.btn}
				data-active={isActive()}
				aria-label={isActive() ? `Sleep timer: ${label()}` : "Sleep timer"}
				title={isActive() ? `Sleep in ${label()}` : "Sleep timer"}
			>
				<Show when={isActive()} fallback={<Moon size={16} />}>
					<MoonStar size={16} />
				</Show>
				<Show when={timer().kind === "duration"}>
					<span class={styles.countdown}>{label()}</span>
				</Show>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Content class={styles.panel}>
					<header class={styles.header}>
						<span class={styles.title}>Sleep timer</span>
						<Show when={isActive()}>
							<button
								type="button"
								class={styles.cancelBtn}
								onClick={cancelSleepTimer}
							>
								Cancel
							</button>
						</Show>
					</header>

					<div class={styles.grid}>
						{PRESETS.map((minutes) => {
							const active = () =>
								timer().kind === "duration" &&
								(timer() as { kind: "duration"; minutes: number }).minutes ===
									minutes;
							return (
								<button
									type="button"
									class={styles.preset}
									data-active={active()}
									onClick={() => setSleepTimerDuration(minutes)}
								>
									<span class={styles.presetMinutes}>{minutes}</span>
									<span class={styles.presetUnit}>min</span>
								</button>
							);
						})}
					</div>

					<button
						type="button"
						class={styles.endOfTrack}
						data-active={timer().kind === "endOfTrack"}
						disabled={!currentSong()}
						onClick={setSleepTimerEndOfTrack}
					>
						End of current track
					</button>
				</Popover.Content>
			</Popover.Portal>
		</Popover>
	);
}
