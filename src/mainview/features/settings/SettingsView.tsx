import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { A } from "@solidjs/router";
import { useStore } from "@nanostores/solid";
import { Plus, Trash2, Radio, Server, Check, Gauge, X, RotateCcw } from "lucide-solid";
import {
	$servers,
	$activeServerId,
	$status,
	setActive,
	removeServer,
	pingActive,
} from "../../stores/servers";
import { SubsonicClient } from "../../lib/subsonic/client";
import type { ServerConfig, SpeedTestResult } from "../../lib/subsonic/types";
import styles from "./SettingsView.module.css";

export function SettingsView() {
	const servers = useStore($servers);
	const activeId = useStore($activeServerId);
	const status = useStore($status);

	onMount(() => {
		if ($activeServerId.get()) void pingActive();
	});

	return (
		<div class={styles.settings}>
			<div class={styles.header}>
				<span class={styles.eyebrow}>Settings</span>
				<h1 class={styles.title}>Your servers</h1>
			</div>

			<section class={styles.section}>
				<div class={styles.sectionHeader}>
					<span class={styles.sectionTitle}>Connected servers</span>
					<A href="/connect" class={styles.sectionHint}>
						Add another
					</A>
				</div>

				<Show
					when={servers().length > 0}
					fallback={
						<div class={styles.emptyState}>
							<div class={styles.emptyIcon}>
								<Server size={20} />
							</div>
							<h3 class={styles.emptyTitle}>No servers yet</h3>
							<p class={styles.emptyHint}>
								Connect your first Navidrome, OpenSubsonic, or Subsonic server to start listening.
							</p>
							<A href="/connect" class={styles.addButton}>
								<Plus /> Add server
							</A>
						</div>
					}
				>
					<div class={styles.serverList}>
						<For each={servers()}>
							{(server) => (
								<ServerCard
									server={server}
									isActive={activeId() === server.id}
									status={activeId() === server.id ? status() : "unknown"}
									onActivate={() => setActive(server.id)}
									onRemove={() => removeServer(server.id)}
								/>
							)}
						</For>
						<A href="/connect" class={styles.addButton}>
							<Plus /> Add another server
						</A>
					</div>
				</Show>
			</section>
		</div>
	);
}

function ServerCard(props: {
	server: ServerConfig;
	isActive: boolean;
	status: "unknown" | "connecting" | "online" | "offline";
	onActivate: () => void;
	onRemove: () => void;
}) {
	const [speed, setSpeed] = createSignal<SpeedTestResult | null>(null);
	const [open, setOpen] = createSignal(false);
	let abortCtrl: AbortController | null = null;

	const typeLabel = () => {
		const t = props.server.caps?.type;
		if (t === "navidrome") return "Navidrome";
		if (t === "opensubsonic") return "OpenSubsonic";
		if (t === "subsonic") return "Subsonic";
		return "Server";
	};

	const metaText = () => {
		const caps = props.server.caps;
		if (!caps) return "Not probed yet";
		return `${caps.serverVersion}${props.server.username ? ` · ${props.server.username}` : ""}`;
	};

	const startSpeedTest = () => {
		setOpen(true);
		abortCtrl?.abort();
		abortCtrl = new AbortController();
		const client = new SubsonicClient(props.server);
		setSpeed({ phase: "ping" });
		void client
			.speedTest({
				signal: abortCtrl.signal,
				onProgress: (snap) => setSpeed(snap),
			})
			.then(setSpeed)
			.catch(() => {});
	};

	const cancelSpeedTest = () => {
		abortCtrl?.abort();
	};

	const closePanel = () => {
		abortCtrl?.abort();
		setOpen(false);
		setSpeed(null);
	};

	onCleanup(() => abortCtrl?.abort());

	const isRunning = () => {
		const s = speed();
		return s ? s.phase === "ping" || s.phase === "stream" : false;
	};

	return (
		<div class={styles.serverCardWrap} data-active={props.isActive}>
			<div class={styles.serverCard}>
				<span class={styles.statusDot} data-status={props.isActive ? props.status : "unknown"} />
				<div class={styles.serverInfo}>
					<div class={styles.serverNameRow}>
						<span class={styles.serverName}>{props.server.name}</span>
						<span class={styles.badge} data-type={props.server.caps?.type ?? "subsonic"}>
							{typeLabel()}
						</span>
					</div>
					<span class={styles.serverUrl}>{props.server.url}</span>
					<span class={styles.serverMeta}>{metaText()}</span>
				</div>
				<div class={styles.serverActions}>
					<button
						class={styles.iconBtn}
						onClick={startSpeedTest}
						title="Test speed"
						data-active={open() ? "true" : undefined}
					>
						<Gauge />
					</button>
					<Show
						when={!props.isActive}
						fallback={
							<button class={styles.iconBtn} disabled title="Active">
								<Check />
							</button>
						}
					>
						<button class={styles.iconBtn} onClick={props.onActivate} title="Switch to this server">
							<Radio />
						</button>
					</Show>
					<button
						class={styles.iconBtn}
						data-danger="true"
						onClick={props.onRemove}
						title="Remove"
					>
						<Trash2 />
					</button>
				</div>
			</div>

			<Show when={open() && speed()}>
				{(snap) => (
					<SpeedPanel
						snap={snap()}
						running={isRunning()}
						onCancel={cancelSpeedTest}
						onRerun={startSpeedTest}
						onClose={closePanel}
					/>
				)}
			</Show>
		</div>
	);
}

function SpeedPanel(props: {
	snap: SpeedTestResult;
	running: boolean;
	onCancel: () => void;
	onRerun: () => void;
	onClose: () => void;
}) {
	const progressPct = () => {
		const s = props.snap;
		if (s.phase === "ping") {
			return 15;
		}
		if (s.bytes && s.targetBytes) {
			return 20 + Math.min(80, (s.bytes / s.targetBytes) * 80);
		}
		if (s.phase === "stream") return 25;
		if (s.phase === "done") return 100;
		return 0;
	};

	const phaseLabel = () => {
		switch (props.snap.phase) {
			case "ping":
				return "Measuring latency…";
			case "stream":
				return "Measuring throughput…";
			case "done":
				return "Done";
			case "cancelled":
				return "Cancelled";
			case "error":
				return props.snap.error ?? "Failed";
			default:
				return "";
		}
	};

	return (
		<div class={styles.speedPanel} data-phase={props.snap.phase}>
			<div class={styles.speedHeader}>
				<span class={styles.speedPhase}>{phaseLabel()}</span>
				<div class={styles.speedControls}>
					<Show
						when={props.running}
						fallback={
							<button class={styles.speedBtn} onClick={props.onRerun} title="Run again">
								<RotateCcw size={14} /> Run again
							</button>
						}
					>
						<button class={styles.speedBtn} onClick={props.onCancel} title="Cancel">
							Cancel
						</button>
					</Show>
					<button class={styles.iconBtn} onClick={props.onClose} title="Close">
						<X />
					</button>
				</div>
			</div>

			<div class={styles.speedBar} data-running={props.running}>
				<div class={styles.speedBarFill} style={{ width: `${progressPct()}%` }} />
			</div>

			<div class={styles.speedMetrics}>
				<Metric
					label="Latency"
					value={formatMs(props.snap.pingMs)}
					rating={rateLatency(props.snap.pingMs)}
				/>
				<Metric
					label="Jitter"
					value={formatMs(props.snap.jitterMs)}
					rating={rateJitter(props.snap.jitterMs)}
				/>
				<Metric
					label="TTFB"
					value={formatMs(props.snap.ttfbMs)}
					rating={rateTtfb(props.snap.ttfbMs)}
				/>
				<Metric
					label="Throughput"
					value={formatMbps(props.snap.throughputMbps)}
					rating={rateThroughput(props.snap.throughputMbps)}
					highlight
				/>
				<Metric
					label="Peak"
					value={formatMbps(props.snap.peakMbps)}
					rating={rateThroughput(props.snap.peakMbps)}
				/>
				<Metric label="Data" value={formatBytes(props.snap.bytes)} />
			</div>

			<Show when={props.snap.phase === "done"}>
				<Verdict snap={props.snap} />
			</Show>
		</div>
	);
}

function Verdict(props: { snap: SpeedTestResult }) {
	const verdict = () => overallVerdict(props.snap);
	return (
		<div class={styles.verdict} data-rating={verdict().rating}>
			<div class={styles.verdictHead}>
				<span class={styles.verdictDot} data-rating={verdict().rating} />
				<span class={styles.verdictLabel}>{verdict().label}</span>
			</div>
			<span class={styles.verdictDetail}>{verdict().detail}</span>
		</div>
	);
}

function Metric(props: {
	label: string;
	value: string;
	highlight?: boolean;
	rating?: Rating;
}) {
	return (
		<div
			class={styles.metric}
			data-highlight={props.highlight ? "true" : undefined}
			data-rating={props.rating}
		>
			<span class={styles.metricLabel}>
				<Show when={props.rating}>
					<span class={styles.metricDot} data-rating={props.rating} />
				</Show>
				{props.label}
			</span>
			<span class={styles.metricValue}>{props.value}</span>
		</div>
	);
}

type Rating = "excellent" | "good" | "usable" | "poor";

function rateLatency(ms: number | undefined): Rating | undefined {
	if (ms == null || ms <= 0) return undefined;
	if (ms < 50) return "excellent";
	if (ms < 150) return "good";
	if (ms < 300) return "usable";
	return "poor";
}

function rateJitter(ms: number | undefined): Rating | undefined {
	if (ms == null || ms < 0) return undefined;
	if (ms < 5) return "excellent";
	if (ms < 20) return "good";
	if (ms < 50) return "usable";
	return "poor";
}

function rateTtfb(ms: number | undefined): Rating | undefined {
	if (ms == null || ms <= 0) return undefined;
	if (ms < 150) return "excellent";
	if (ms < 400) return "good";
	if (ms < 800) return "usable";
	return "poor";
}

function rateThroughput(mbps: number | undefined): Rating | undefined {
	if (mbps == null || mbps <= 0) return undefined;
	if (mbps >= 5) return "excellent";
	if (mbps >= 1.5) return "good";
	if (mbps >= 0.4) return "usable";
	return "poor";
}

function overallVerdict(snap: SpeedTestResult): {
	rating: Rating;
	label: string;
	detail: string;
} {
	const tp = snap.throughputMbps ?? 0;
	const lat = snap.pingMs ?? 0;

	// throughput dominates, latency can drop one level if very high
	let rating: Rating;
	if (tp >= 5) rating = "excellent";
	else if (tp >= 1.5) rating = "good";
	else if (tp >= 0.4) rating = "usable";
	else rating = "poor";

	if (lat >= 500 && rating !== "poor") rating = "usable";
	if (lat >= 1000) rating = "poor";

	const audio = audioVerdict(tp);
	const latencyNote =
		lat >= 500
			? " Library browsing will feel laggy."
			: lat >= 250
			  ? " Browsing feels a little sluggish."
			  : "";

	const labels: Record<Rating, string> = {
		excellent: "Excellent",
		good: "Good",
		usable: "Usable",
		poor: "Poor",
	};

	return {
		rating,
		label: labels[rating],
		detail: `${audio}${latencyNote}`.trim(),
	};
}

function audioVerdict(mbps: number): string {
	if (mbps >= 10) return "Hi-res (24-bit / 96 kHz) streams comfortably.";
	if (mbps >= 5) return "Lossless FLAC streams with plenty of headroom.";
	if (mbps >= 1.5) return "Lossless FLAC (16-bit) streams smoothly; hi-res may buffer.";
	if (mbps >= 0.4) return "MP3 320 kbps is fine; FLAC may stutter on busy tracks.";
	if (mbps > 0) return "Only low-bitrate MP3 (128 kbps) will stream reliably.";
	return "No throughput measured.";
}

function formatMs(ms: number | undefined): string {
	if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
	if (ms < 10) return `${ms.toFixed(1)} ms`;
	return `${Math.round(ms)} ms`;
}

function formatMbps(mbps: number | undefined): string {
	if (mbps == null || !Number.isFinite(mbps) || mbps <= 0) return "—";
	if (mbps >= 100) return `${Math.round(mbps)} Mbps`;
	if (mbps >= 10) return `${mbps.toFixed(1)} Mbps`;
	return `${mbps.toFixed(2)} Mbps`;
}

function formatBytes(bytes: number | undefined): string {
	if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${bytes} B`;
}
