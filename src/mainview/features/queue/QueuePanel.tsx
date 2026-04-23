import {
	For,
	Show,
	createMemo,
	createSignal,
	createEffect,
	onCleanup,
} from "solid-js";
import { Portal } from "solid-js/web";
import { useStore } from "@nanostores/solid";
import {
	DragDropProvider,
	DragDropSensors,
	DragOverlay,
	SortableProvider,
	closestCenter,
	createSortable,
	type DragEvent as SortableDragEvent,
} from "@thisbeyond/solid-dnd";
import { ChevronDown, GripVertical, X } from "lucide-solid";
import {
	$queue,
	$currentIndex,
	$queueOpen,
	addToQueue,
	closeQueue,
	jumpTo,
	playNextInQueue,
	removeFromQueue,
	reorderQueue,
} from "../../stores/player";
import { $activeServer } from "../../stores/servers";
import { clientFor } from "../../lib/queries/useActiveClient";
import type { Song } from "../../lib/subsonic";
import { CoverArt } from "../../components/CoverArt";
import styles from "./QueuePanel.module.css";

const SONG_DRAG_MIME = "application/x-navidrome-song";

interface RowEntry {
	id: string;
	song: Song;
	queueIndex: number;
}

function readDroppedSong(e: DragEvent): Song | null {
	const data = e.dataTransfer?.getData(SONG_DRAG_MIME);
	if (!data) return null;
	try {
		const song = JSON.parse(data) as Song;
		if (!song || typeof song.id !== "string") return null;
		return song;
	} catch {
		return null;
	}
}

function makeRows(songs: Song[], offset: number): RowEntry[] {
	return songs.map((song, i) => ({
		id: `${song.id}-${offset + i}`,
		song,
		queueIndex: offset + i,
	}));
}

function formatDuration(seconds?: number): string {
	if (!seconds || !Number.isFinite(seconds)) return "";
	const s = Math.floor(seconds);
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${r.toString().padStart(2, "0")}`;
}

export function QueuePanel() {
	const open = useStore($queueOpen);
	const queue = useStore($queue);
	const currentIndex = useStore($currentIndex);
	const activeServer = useStore($activeServer);
	const [historyOpen, setHistoryOpen] = createSignal(false);
	const [dropActive, setDropActive] = createSignal(false);
	let dragDepth = 0;

	const currentSong = createMemo<Song | null>(() => {
		const q = queue();
		const i = currentIndex();
		return i >= 0 && i < q.length ? q[i]! : null;
	});

	const upNextRows = createMemo<RowEntry[]>(() => {
		const q = queue();
		const i = currentIndex();
		if (i < 0) return makeRows(q, 0);
		return makeRows(q.slice(i + 1), i + 1);
	});

	const historyRows = createMemo<RowEntry[]>(() => {
		const q = queue();
		const i = currentIndex();
		if (i <= 0) return [];
		return makeRows(q.slice(0, i), 0).reverse();
	});

	const coverFor = (song: Song): string | undefined => {
		const server = activeServer();
		if (!server) return undefined;
		return clientFor(server).coverArtUrl(song.coverArt, 96);
	};

	createEffect(() => {
		if (!open()) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				closeQueue();
			}
		};
		window.addEventListener("keydown", onKey);
		onCleanup(() => window.removeEventListener("keydown", onKey));
	});

	const handleDragEnd = (e: SortableDragEvent) => {
		if (!e.draggable || !e.droppable) return;
		const fromId = String(e.draggable.id);
		const toId = String(e.droppable.id);
		if (fromId === toId) return;
		const rows = upNextRows();
		const from = rows.find((r) => r.id === fromId)?.queueIndex;
		const to = rows.find((r) => r.id === toId)?.queueIndex;
		if (from === undefined || to === undefined) return;
		reorderQueue(from, to);
	};

	const handleNativeDragOver = (e: DragEvent) => {
		if (!e.dataTransfer?.types.includes(SONG_DRAG_MIME)) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "copy";
	};

	const handleNativeDragEnter = (e: DragEvent) => {
		if (!e.dataTransfer?.types.includes(SONG_DRAG_MIME)) return;
		dragDepth += 1;
		setDropActive(true);
	};

	const handleNativeDragLeave = (e: DragEvent) => {
		if (!e.dataTransfer?.types.includes(SONG_DRAG_MIME)) return;
		dragDepth = Math.max(0, dragDepth - 1);
		if (dragDepth === 0) setDropActive(false);
	};

	const handleNativeDrop = (mode: "append" | "next") => (e: DragEvent) => {
		const song = readDroppedSong(e);
		if (!song) return;
		e.preventDefault();
		e.stopPropagation();
		dragDepth = 0;
		setDropActive(false);
		if (mode === "next") playNextInQueue(song);
		else addToQueue(song);
	};

	return (
		<Show when={open()}>
			<Portal>
				<aside
					class={styles.panel}
					role="complementary"
					aria-label="Queue"
					data-drop-active={dropActive()}
					onDragEnter={handleNativeDragEnter}
					onDragOver={handleNativeDragOver}
					onDragLeave={handleNativeDragLeave}
					onDrop={handleNativeDrop("append")}
				>
					<header class={styles.header}>
						<h2 class={styles.title}>Queue</h2>
						<button
							type="button"
							class={styles.closeBtn}
							onClick={closeQueue}
							aria-label="Close queue"
						>
							<X size={18} />
						</button>
					</header>

					<div class={styles.scroll}>
						<Show when={currentSong()}>
							{(song) => (
								<section
									class={styles.section}
									data-drop-zone="next"
									onDragOver={handleNativeDragOver}
									onDrop={handleNativeDrop("next")}
								>
									<span class={styles.sectionLabel}>Now playing</span>
									<NowPlayingRow song={song()} cover={coverFor(song())} />
									<Show when={dropActive()}>
										<span class={styles.dropHint}>
											Drop to play next
										</span>
									</Show>
								</section>
							)}
						</Show>

						<Show
							when={upNextRows().length > 0}
							fallback={
								<Show when={!currentSong()}>
									<EmptyState />
								</Show>
							}
						>
							<section class={styles.section}>
								<span class={styles.sectionLabel}>
									Up next · {upNextRows().length}
								</span>
								<DragDropProvider
									collisionDetector={closestCenter}
									onDragEnd={handleDragEnd}
								>
									<DragDropSensors />
									<SortableProvider ids={upNextRows().map((r) => r.id)}>
										<ol class={styles.list}>
											<For each={upNextRows()}>
												{(row) => (
													<SortableRow
														row={row}
														cover={coverFor(row.song)}
													/>
												)}
											</For>
										</ol>
									</SortableProvider>
									<DragOverlay>
										{(draggable) => {
											const rowId = String(draggable?.id ?? "");
											const row = upNextRows().find((r) => r.id === rowId);
											return row ? (
												<DragGhost
													song={row.song}
													cover={coverFor(row.song)}
												/>
											) : null;
										}}
									</DragOverlay>
								</DragDropProvider>
							</section>
						</Show>

						<Show when={historyRows().length > 0}>
							<section class={styles.section}>
								<button
									type="button"
									class={styles.historyToggle}
									onClick={() => setHistoryOpen(!historyOpen())}
									aria-expanded={historyOpen()}
								>
									<ChevronDown
										size={14}
										class={styles.historyChevron}
										data-open={historyOpen()}
									/>
									<span class={styles.sectionLabel}>
										History · {historyRows().length}
									</span>
								</button>
								<Show when={historyOpen()}>
									<ol class={styles.list}>
										<For each={historyRows()}>
											{(row) => (
												<StaticRow
													song={row.song}
													cover={coverFor(row.song)}
													onPlay={() => jumpTo(row.queueIndex)}
													onRemove={() => removeFromQueue(row.queueIndex)}
												/>
											)}
										</For>
									</ol>
								</Show>
							</section>
						</Show>
					</div>
				</aside>
			</Portal>
		</Show>
	);
}

function NowPlayingRow(props: { song: Song; cover?: string }) {
	return (
		<div class={`${styles.row} ${styles.rowActive}`}>
			<CoverArt
				src={props.cover}
				name={props.song.title}
				size={40}
				class={styles.cover}
			/>
			<div class={styles.text}>
				<span class={styles.songTitle}>{props.song.title}</span>
				<Show when={props.song.artist}>
					<span class={styles.songArtist}>{props.song.artist}</span>
				</Show>
			</div>
			<span class={styles.duration}>
				{formatDuration(props.song.duration)}
			</span>
		</div>
	);
}

function SortableRow(props: { row: RowEntry; cover?: string }) {
	const sortable = createSortable(props.row.id);
	return (
		<li
			ref={sortable.ref}
			class={styles.row}
			data-dragging={sortable.isActiveDraggable}
			style={{
				transform: sortable.transform
					? `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`
					: undefined,
				transition: sortable.transform ? "transform 200ms ease" : undefined,
			}}
			onDblClick={() => jumpTo(props.row.queueIndex)}
		>
			<button
				type="button"
				class={styles.handle}
				aria-label="Drag to reorder"
				{...sortable.dragActivators}
			>
				<GripVertical size={14} />
			</button>
			<CoverArt
				src={props.cover}
				name={props.row.song.title}
				size={40}
				class={styles.cover}
			/>
			<div class={styles.text} onClick={() => jumpTo(props.row.queueIndex)}>
				<span class={styles.songTitle}>{props.row.song.title}</span>
				<Show when={props.row.song.artist}>
					<span class={styles.songArtist}>{props.row.song.artist}</span>
				</Show>
			</div>
			<span class={styles.duration}>
				{formatDuration(props.row.song.duration)}
			</span>
			<button
				type="button"
				class={styles.removeBtn}
				aria-label="Remove from queue"
				onClick={() => removeFromQueue(props.row.queueIndex)}
			>
				<X size={14} />
			</button>
		</li>
	);
}

function StaticRow(props: {
	song: Song;
	cover?: string;
	onPlay: () => void;
	onRemove: () => void;
}) {
	return (
		<li class={styles.row} data-history>
			<CoverArt
				src={props.cover}
				name={props.song.title}
				size={40}
				class={styles.cover}
			/>
			<div class={styles.text} onClick={props.onPlay}>
				<span class={styles.songTitle}>{props.song.title}</span>
				<Show when={props.song.artist}>
					<span class={styles.songArtist}>{props.song.artist}</span>
				</Show>
			</div>
			<span class={styles.duration}>
				{formatDuration(props.song.duration)}
			</span>
			<button
				type="button"
				class={styles.removeBtn}
				aria-label="Remove from queue"
				onClick={props.onRemove}
			>
				<X size={14} />
			</button>
		</li>
	);
}

function DragGhost(props: { song: Song; cover?: string }) {
	return (
		<div class={`${styles.row} ${styles.ghost}`}>
			<CoverArt
				src={props.cover}
				name={props.song.title}
				size={40}
				class={styles.cover}
			/>
			<div class={styles.text}>
				<span class={styles.songTitle}>{props.song.title}</span>
				<Show when={props.song.artist}>
					<span class={styles.songArtist}>{props.song.artist}</span>
				</Show>
			</div>
		</div>
	);
}

function EmptyState() {
	return (
		<div class={styles.empty}>
			<p>Queue is empty.</p>
			<p class={styles.emptyHint}>Play something to get started.</p>
		</div>
	);
}
