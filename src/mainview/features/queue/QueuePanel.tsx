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
import { ChevronDown, GripVertical, Radio, Trash2, X } from "lucide-solid";
import {
	$contextIndex,
	$contextQueue,
	$currentSong,
	$hasQueue,
	$queueOpen,
	$queueSources,
	$shuffle,
	$shuffleOrder,
	$smartRadio,
	$userQueue,
	addToQueue,
	clearQueue,
	closeQueue,
	insertIntoUserQueue,
	jumpToContext,
	jumpToUserQueue,
	playNextInQueue,
	removeFromContext,
	removeFromUserQueue,
	reorderUserQueue,
	toggleSmartRadio,
} from "../../stores/player";
import { $playHistory } from "../../stores/history";
import { $queueServer } from "../../stores/servers";
import { clientFor } from "../../lib/queries/useActiveClient";
import type { Song } from "../../lib/subsonic";
import { CoverArt } from "../../components/CoverArt";
import styles from "./QueuePanel.module.css";

const SONG_DRAG_MIME = "application/x-navidrome-song";

type UserRow = { kind: "user"; id: string; song: Song; index: number };
type ContextRow = { kind: "context"; id: string; song: Song; index: number };

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

function formatDuration(seconds?: number): string {
	if (!seconds || !Number.isFinite(seconds)) return "";
	const s = Math.floor(seconds);
	const m = Math.floor(s / 60);
	const r = s % 60;
	return `${m}:${r.toString().padStart(2, "0")}`;
}

export function QueuePanel() {
	const open = useStore($queueOpen);
	const currentSong = useStore($currentSong);
	const contextQueue = useStore($contextQueue);
	const contextIndex = useStore($contextIndex);
	const userQueue = useStore($userQueue);
	const shuffle = useStore($shuffle);
	const shuffleOrder = useStore($shuffleOrder);
	const hasQueue = useStore($hasQueue);
	const activeServer = useStore($queueServer);
	const queueSources = useStore($queueSources);
	const smartRadio = useStore($smartRadio);
	const playHistory = useStore($playHistory);
	const [historyOpen, setHistoryOpen] = createSignal(false);
	const [dropActive, setDropActive] = createSignal(false);
	const [rowDropTarget, setRowDropTarget] = createSignal<{
		rowId: string;
		above: boolean;
	} | null>(null);
	let dragDepth = 0;

	const userRows = createMemo<UserRow[]>(() =>
		userQueue().map((song, i) => ({
			kind: "user",
			id: `user-${song.id}-${i}`,
			song,
			index: i,
		})),
	);

	const contextRows = createMemo<ContextRow[]>(() => {
		const ctx = contextQueue();
		const idx = contextIndex();
		if (shuffle()) {
			// Render the actual shuffled upcoming order so the UI matches what
			// playback will do, not the array's natural order.
			return shuffleOrder()
				.map((i, row) => {
					const song = ctx[i];
					if (!song) return null;
					return {
						kind: "context" as const,
						id: `ctx-${song.id}-${i}-${row}`,
						song,
						index: i,
					};
				})
				.filter((r): r is ContextRow => r !== null);
		}
		if (idx < 0) {
			return ctx.map((song, i) => ({
				kind: "context",
				id: `ctx-${song.id}-${i}`,
				song,
				index: i,
			}));
		}
		const upcoming: ContextRow[] = [];
		for (let i = idx + 1; i < ctx.length; i++) {
			upcoming.push({
				kind: "context",
				id: `ctx-${ctx[i]!.id}-${i}`,
				song: ctx[i]!,
				index: i,
			});
		}
		return upcoming;
	});

	const recentHistory = createMemo(() => {
		// Drop the current song if it's already on top of history.
		const cur = currentSong();
		const hist = playHistory();
		if (cur && hist[0]?.songId === cur.id) return hist.slice(1, 26);
		return hist.slice(0, 25);
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

	// ─── drag & drop ────────────────────────────────────────────────────────

	const handleSortEnd = (e: SortableDragEvent) => {
		if (!e.draggable || !e.droppable) return;
		const fromId = String(e.draggable.id);
		const toId = String(e.droppable.id);
		if (fromId === toId) return;
		const rows = userRows();
		const from = rows.find((r) => r.id === fromId)?.index;
		const to = rows.find((r) => r.id === toId)?.index;
		if (from === undefined || to === undefined) return;
		reorderUserQueue(from, to);
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
		if (dragDepth === 0) {
			setDropActive(false);
			setRowDropTarget(null);
		}
	};

	const handleNativeDrop = (mode: "append" | "next") => (e: DragEvent) => {
		const song = readDroppedSong(e);
		if (!song) return;
		e.preventDefault();
		e.stopPropagation();
		dragDepth = 0;
		setDropActive(false);
		setRowDropTarget(null);
		if (mode === "next") playNextInQueue(song);
		else addToQueue(song);
	};

	const handleUserRowDragOver = (rowId: string) => (e: DragEvent) => {
		if (!e.dataTransfer?.types.includes(SONG_DRAG_MIME)) return;
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = "copy";
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const above = e.clientY < rect.top + rect.height / 2;
		const current = rowDropTarget();
		if (!current || current.rowId !== rowId || current.above !== above) {
			setRowDropTarget({ rowId, above });
		}
	};

	const handleUserRowDrop = (index: number) => (e: DragEvent) => {
		const song = readDroppedSong(e);
		if (!song) return;
		e.preventDefault();
		e.stopPropagation();
		const target = rowDropTarget();
		const insertAt = target?.above ? index : index + 1;
		dragDepth = 0;
		setDropActive(false);
		setRowDropTarget(null);
		insertIntoUserQueue(song, insertAt);
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
						<div class={styles.headerActions}>
							<button
								type="button"
								class={styles.radioBtn}
								onClick={toggleSmartRadio}
								data-active={smartRadio()}
								aria-pressed={smartRadio()}
								aria-label={
									smartRadio() ? "Turn off smart radio" : "Turn on smart radio"
								}
								title={
									smartRadio()
										? "Smart radio on — similar tracks auto-queue"
										: "Smart radio off"
								}
							>
								<Radio size={16} />
							</button>
							<Show when={hasQueue()}>
								<button
									type="button"
									class={styles.radioBtn}
									onClick={() => {
										if (confirm("Clear the entire queue?")) clearQueue();
									}}
									aria-label="Clear queue"
									title="Clear queue"
								>
									<Trash2 size={16} />
								</button>
							</Show>
							<button
								type="button"
								class={styles.closeBtn}
								onClick={closeQueue}
								aria-label="Close queue"
							>
								<X size={18} />
							</button>
						</div>
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
										<span class={styles.dropHint}>Drop to play next</span>
									</Show>
								</section>
							)}
						</Show>

						<Show when={userRows().length > 0}>
							<section class={styles.section}>
								<span class={styles.sectionLabel}>
									Next in queue · {userRows().length}
								</span>
								<DragDropProvider
									collisionDetector={closestCenter}
									onDragEnd={handleSortEnd}
								>
									<DragDropSensors />
									<SortableProvider ids={userRows().map((r) => r.id)}>
										<ol class={styles.list}>
											<For each={userRows()}>
												{(row, index) => {
													const target = () => rowDropTarget();
													return (
														<SortableUserRow
															row={row}
															cover={coverFor(row.song)}
															staggerIndex={Math.min(index(), 15)}
															dropAbove={
																target()?.rowId === row.id &&
																target()?.above === true
															}
															dropBelow={
																target()?.rowId === row.id &&
																target()?.above === false
															}
															onNativeDragOver={handleUserRowDragOver(row.id)}
															onNativeDrop={handleUserRowDrop(row.index)}
														/>
													);
												}}
											</For>
										</ol>
									</SortableProvider>
									<DragOverlay>
										{(draggable) => {
											const rowId = String(draggable?.id ?? "");
											const row = userRows().find((r) => r.id === rowId);
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

						<Show when={contextRows().length > 0}>
							<section class={styles.section}>
								<span class={styles.sectionLabel}>
									Next up · {contextRows().length}
								</span>
								<ol class={styles.list}>
									<For each={contextRows()}>
										{(row, index) => (
											<StaticRow
												song={row.song}
												cover={coverFor(row.song)}
												staggerIndex={Math.min(index(), 15)}
												isRadio={
													queueSources()[row.song.id] === "radio"
												}
												onPlay={() => jumpToContext(row.index)}
												onRemove={() => removeFromContext(row.index)}
											/>
										)}
									</For>
								</ol>
							</section>
						</Show>

						<Show when={!currentSong() && userRows().length === 0 && contextRows().length === 0}>
							<EmptyState />
						</Show>

						<Show when={recentHistory().length > 0}>
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
										Recently played · {recentHistory().length}
									</span>
								</button>
								<Show when={historyOpen()}>
									<ol class={styles.list}>
										<For each={recentHistory()}>
											{(entry, index) => (
												<StaticRow
													song={entry.song}
													cover={coverFor(entry.song)}
													staggerIndex={Math.min(index(), 15)}
													onPlay={() => playNextInQueue(entry.song)}
													readonly
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

function SortableUserRow(props: {
	row: UserRow;
	cover?: string;
	staggerIndex?: number;
	dropAbove?: boolean;
	dropBelow?: boolean;
	onNativeDragOver?: (e: DragEvent) => void;
	onNativeDrop?: (e: DragEvent) => void;
}) {
	const sortable = createSortable(props.row.id);
	return (
		<li
			ref={sortable.ref}
			class={styles.row}
			data-dragging={sortable.isActiveDraggable}
			data-drop-above={props.dropAbove ? "true" : undefined}
			data-drop-below={props.dropBelow ? "true" : undefined}
			style={{
				"--i": props.staggerIndex ?? 0,
				transform: sortable.transform
					? `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)`
					: undefined,
				transition: sortable.transform ? "transform 200ms ease" : undefined,
			}}
			onDblClick={() => jumpToUserQueue(props.row.index)}
			onDragOver={props.onNativeDragOver}
			onDrop={props.onNativeDrop}
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
			<div
				class={styles.text}
				onClick={() => jumpToUserQueue(props.row.index)}
			>
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
				onClick={() => removeFromUserQueue(props.row.index)}
			>
				<X size={14} />
			</button>
		</li>
	);
}

function StaticRow(props: {
	song: Song;
	cover?: string;
	staggerIndex?: number;
	isRadio?: boolean;
	readonly?: boolean;
	onPlay: () => void;
	onRemove?: () => void;
}) {
	const hasRemove = () => Boolean(props.onRemove) && !props.readonly;
	return (
		<li
			class={styles.row}
			data-static="true"
			data-no-remove={hasRemove() ? undefined : "true"}
			data-radio={props.isRadio ? "true" : undefined}
			style={{ "--i": props.staggerIndex ?? 0 }}
			onClick={props.onPlay}
		>
			<CoverArt
				src={props.cover}
				name={props.song.title}
				size={40}
				class={styles.cover}
			/>
			<div class={styles.text}>
				<span class={styles.songTitle}>
					<Show when={props.isRadio}>
						<Radio size={11} class={styles.radioMark} aria-hidden="true" />
					</Show>
					{props.song.title}
				</span>
				<Show when={props.song.artist}>
					<span class={styles.songArtist}>{props.song.artist}</span>
				</Show>
			</div>
			<span class={styles.duration}>
				{formatDuration(props.song.duration)}
			</span>
			<Show when={hasRemove()}>
				<button
					type="button"
					class={styles.removeBtn}
					aria-label="Remove from queue"
					onClick={(e) => {
						e.stopPropagation();
						props.onRemove?.();
					}}
				>
					<X size={14} />
				</button>
			</Show>
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
