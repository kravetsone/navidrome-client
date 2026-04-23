import { onCleanup, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { useQueryClient, type QueryClient } from "@tanstack/solid-query";
import {
	$currentSong,
	$nowPlayingOpen,
	$queueOpen,
	$volume,
	closeNowPlaying,
	closeQueue,
	cycleRepeat,
	playNext,
	playPrevious,
	setVolume,
	toggleQueue,
	togglePlay,
	toggleShuffle,
} from "../stores/player";
import { $activeServer } from "../stores/servers";
import { $canBack, $canForward } from "../stores/navigation";
import { clientFor } from "./queries/useActiveClient";
import { starMutation } from "./queries/mutations";

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
	if (target.isContentEditable) return true;
	if (target.getAttribute("role") === "textbox") return true;
	return false;
}

function adjustVolume(delta: number) {
	setVolume($volume.get() + delta);
}

async function starCurrent(queryClient: QueryClient) {
	const song = $currentSong.get();
	const server = $activeServer.get();
	if (!song || !server) return;
	const mutation = starMutation({
		client: clientFor(server),
		serverId: server.id,
		queryClient,
	});
	const vars = {
		kind: "song" as const,
		id: song.id,
		starred: !song.starred,
	};
	const context = await mutation.onMutate(vars);
	try {
		await mutation.mutationFn(vars);
	} catch (err) {
		mutation.onError(err, vars, context);
	} finally {
		mutation.onSettled();
	}
}

export function installShortcuts() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const handler = (e: KeyboardEvent) => {
		if (isEditableTarget(e.target)) return;
		if (e.metaKey || e.ctrlKey || e.altKey) {
			if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "q") {
				e.preventDefault();
				toggleQueue();
				return;
			}
			if ((e.metaKey || e.ctrlKey) && e.key === ",") {
				e.preventDefault();
				navigate("/settings");
				return;
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "[") {
				if ($canBack.get()) {
					e.preventDefault();
					navigate(-1);
				}
				return;
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "]") {
				if ($canForward.get()) {
					e.preventDefault();
					navigate(1);
				}
				return;
			}
			return;
		}

		switch (e.key) {
			case " ":
			case "Spacebar": {
				e.preventDefault();
				togglePlay();
				return;
			}
			case "ArrowRight": {
				e.preventDefault();
				playNext();
				return;
			}
			case "ArrowLeft": {
				e.preventDefault();
				playPrevious();
				return;
			}
			case "ArrowUp": {
				e.preventDefault();
				adjustVolume(0.05);
				return;
			}
			case "ArrowDown": {
				e.preventDefault();
				adjustVolume(-0.05);
				return;
			}
			case "Escape": {
				if ($nowPlayingOpen.get()) {
					e.preventDefault();
					closeNowPlaying();
					return;
				}
				if ($queueOpen.get()) {
					e.preventDefault();
					closeQueue();
					return;
				}
				return;
			}
		}

		const k = e.key.toLowerCase();
		switch (k) {
			case "m": {
				e.preventDefault();
				setVolume($volume.get() === 0 ? 0.8 : 0);
				return;
			}
			case "s": {
				e.preventDefault();
				toggleShuffle();
				return;
			}
			case "r": {
				e.preventDefault();
				cycleRepeat();
				return;
			}
			case "l": {
				e.preventDefault();
				starCurrent(queryClient);
				return;
			}
		}
	};

	onMount(() => {
		window.addEventListener("keydown", handler);
	});
	onCleanup(() => {
		window.removeEventListener("keydown", handler);
	});
}
