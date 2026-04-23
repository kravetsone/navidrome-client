import { Search } from "lucide-solid";
import { openPalette } from "../../stores/search-palette";
import styles from "./SearchPill.module.css";

const isMac =
	typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function SearchPill() {
	return (
		<button
			type="button"
			class={styles.pill}
			aria-label="Open search"
			onClick={() => openPalette()}
		>
			<Search class={styles.icon} />
			<span class={styles.label}>Search library…</span>
			<span class={styles.shortcut} aria-hidden="true">
				<kbd>{isMac ? "⌘" : "Ctrl"}</kbd>
				<kbd>K</kbd>
			</span>
		</button>
	);
}
