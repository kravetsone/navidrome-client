import { atom, computed } from "nanostores";
import { $currentSong, $isPlaying } from "./player";
import { pushToast } from "./toast";

export type SleepTimerMode =
	| { kind: "off" }
	| { kind: "duration"; endsAt: number; minutes: number }
	| { kind: "endOfTrack"; armedAt: number; songId: string };

export const $sleepTimer = atom<SleepTimerMode>({ kind: "off" });

export const $sleepTimerActive = computed(
	$sleepTimer,
	(t) => t.kind !== "off",
);

let durationTimer: ReturnType<typeof setTimeout> | null = null;

function fire(message: string) {
	$isPlaying.set(false);
	$sleepTimer.set({ kind: "off" });
	pushToast(message, { variant: "info", duration: 5000 });
}

function clearDurationTimer() {
	if (durationTimer != null) {
		clearTimeout(durationTimer);
		durationTimer = null;
	}
}

export function setSleepTimerDuration(minutes: number) {
	clearDurationTimer();
	const ms = minutes * 60 * 1000;
	const endsAt = Date.now() + ms;
	$sleepTimer.set({ kind: "duration", endsAt, minutes });
	durationTimer = setTimeout(
		() => fire(`Sleep timer ended after ${minutes} min — paused.`),
		ms,
	);
}

export function setSleepTimerEndOfTrack() {
	clearDurationTimer();
	const song = $currentSong.get();
	if (!song) return;
	$sleepTimer.set({
		kind: "endOfTrack",
		armedAt: Date.now(),
		songId: song.id,
	});
}

export function cancelSleepTimer() {
	clearDurationTimer();
	$sleepTimer.set({ kind: "off" });
}

/** Called by the audio engine when a track ends. */
export function notifyTrackEnded(songId: string) {
	const t = $sleepTimer.get();
	if (t.kind === "endOfTrack" && t.songId === songId) {
		fire("Sleep timer fired — paused after this track.");
	}
}
