import { Show, createMemo } from "solid-js";
import { Portal } from "solid-js/web";
import { useStore } from "@nanostores/solid";
import { AlertTriangle, Download, RefreshCw, Sparkles, X } from "lucide-solid";
import {
	$updaterBanner,
	applyUpdateNow,
	dismissUpdaterBanner,
	triggerUpdateCheck,
} from "../../stores/updater";
import styles from "./UpdateBanner.module.css";

export function UpdateBanner() {
	const banner = useStore($updaterBanner);

	const progressPercent = createMemo(() => {
		const b = banner();
		if (!b || b.kind !== "downloading") return null;
		const p = b.progress;
		if (typeof p !== "number") return null;
		return Math.max(0, Math.min(100, Math.round(p * 100)));
	});

	const kind = () => banner()?.kind ?? "idle";
	const version = () => {
		const b = banner();
		if (!b) return "";
		if (b.kind === "downloading" || b.kind === "ready") return b.version;
		return "";
	};
	const errorMsg = () => {
		const b = banner();
		return b?.kind === "error" ? b.message : "";
	};

	return (
		<Show when={banner()}>
			<Portal>
				<div
					class={styles.banner}
					data-state={kind()}
					role="status"
					aria-live="polite"
				>
					<div class={styles.icon}>
						<Show
							when={kind() === "error"}
							fallback={
								<Show
									when={kind() === "ready"}
									fallback={<Download size={16} />}
								>
									<Sparkles size={16} />
								</Show>
							}
						>
							<AlertTriangle size={16} />
						</Show>
					</div>
					<div class={styles.body}>
						<Show when={kind() === "downloading"}>
							<span class={styles.title}>
								Downloading update{version() ? ` v${version()}` : "…"}
							</span>
							<div class={styles.track}>
								<div
									class={styles.fill}
									data-indeterminate={progressPercent() === null}
									style={
										progressPercent() !== null
											? { width: `${progressPercent()}%` }
											: undefined
									}
								/>
							</div>
						</Show>
						<Show when={kind() === "ready"}>
							<span class={styles.title}>
								Update{version() ? ` v${version()}` : ""} ready
							</span>
							<span class={styles.subtitle}>
								Restart to install — your queue stays put.
							</span>
						</Show>
						<Show when={kind() === "error"}>
							<span class={styles.title}>Update failed</span>
							<span class={styles.subtitle}>{errorMsg()}</span>
						</Show>
					</div>
					<Show when={kind() === "ready"}>
						<button
							type="button"
							class={styles.primary}
							onClick={() => void applyUpdateNow()}
						>
							Restart
						</button>
					</Show>
					<Show when={kind() === "error"}>
						<button
							type="button"
							class={styles.primary}
							onClick={() => void triggerUpdateCheck()}
							title="Try again"
						>
							<RefreshCw size={14} />
							Retry
						</button>
					</Show>
					<button
						type="button"
						class={styles.dismiss}
						onClick={dismissUpdaterBanner}
						aria-label="Dismiss update notification"
						title="Later"
					>
						<X size={14} />
					</button>
				</div>
			</Portal>
		</Show>
	);
}
