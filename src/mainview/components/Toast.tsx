import { For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useStore } from "@nanostores/solid";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-solid";
import { $toasts, dismissToast, type ToastEntry } from "../stores/toast";
import styles from "./Toast.module.css";

function iconFor(variant: ToastEntry["variant"]) {
	if (variant === "error") return <AlertCircle size={16} />;
	if (variant === "success") return <CheckCircle2 size={16} />;
	return <Info size={16} />;
}

export function ToastViewport() {
	const toasts = useStore($toasts);
	return (
		<Show when={toasts().length > 0}>
			<Portal>
				<div class={styles.viewport} role="status" aria-live="polite">
					<For each={toasts()}>
						{(toast) => (
							<div class={styles.toast} data-variant={toast.variant}>
								<span class={styles.icon}>{iconFor(toast.variant)}</span>
								<span class={styles.message}>{toast.message}</span>
								<button
									type="button"
									class={styles.close}
									onClick={() => dismissToast(toast.id)}
									aria-label="Dismiss"
								>
									<X size={14} />
								</button>
							</div>
						)}
					</For>
				</div>
			</Portal>
		</Show>
	);
}
