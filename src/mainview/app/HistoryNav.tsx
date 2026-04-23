import { useNavigate } from "@solidjs/router";
import { useStore } from "@nanostores/solid";
import { ChevronLeft, ChevronRight } from "lucide-solid";
import { $canBack, $canForward } from "../stores/navigation";
import styles from "./HistoryNav.module.css";

export function HistoryNav() {
	const navigate = useNavigate();
	const canBack = useStore($canBack);
	const canForward = useStore($canForward);
	return (
		<div class={styles.nav}>
			<button
				type="button"
				class={styles.btn}
				aria-label="Back"
				title="Back (⌘[)"
				disabled={!canBack()}
				onClick={() => navigate(-1)}
			>
				<ChevronLeft size={18} />
			</button>
			<button
				type="button"
				class={styles.btn}
				aria-label="Forward"
				title="Forward (⌘])"
				disabled={!canForward()}
				onClick={() => navigate(1)}
			>
				<ChevronRight size={18} />
			</button>
		</div>
	);
}
