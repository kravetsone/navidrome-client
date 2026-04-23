import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { useStore } from "@nanostores/solid";
import { X } from "lucide-solid";
import { $lightbox, closeLightbox } from "../../stores/lightbox";
import styles from "./LightboxView.module.css";

export function LightboxView() {
	const content = useStore($lightbox);
	const [loaded, setLoaded] = createSignal(false);

	createEffect(() => {
		const c = content();
		if (!c) {
			setLoaded(false);
			return;
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				closeLightbox();
			}
		};
		window.addEventListener("keydown", onKey);
		onCleanup(() => window.removeEventListener("keydown", onKey));
	});

	return (
		<Show when={content()}>
			{(data) => (
				<Portal>
					<div
						class={styles.overlay}
						onClick={closeLightbox}
						role="dialog"
						aria-modal="true"
						aria-label={`Artwork: ${data().name}`}
					>
						<button
							type="button"
							class={styles.closeBtn}
							onClick={closeLightbox}
							aria-label="Close"
						>
							<X size={18} />
						</button>
						<img
							class={styles.image}
							src={data().url}
							alt={data().name}
							draggable={false}
							data-loaded={loaded()}
							onLoad={() => setLoaded(true)}
							onClick={(e) => e.stopPropagation()}
						/>
					</div>
				</Portal>
			)}
		</Show>
	);
}
