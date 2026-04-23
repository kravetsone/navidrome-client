import { Dialog } from "@kobalte/core/dialog";
import type { JSX } from "solid-js";
import styles from "./Modal.module.css";

export interface ModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	children: JSX.Element;
	width?: number;
}

export function Modal(props: ModalProps) {
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange} modal>
			<Dialog.Portal>
				<Dialog.Overlay class={styles.overlay} />
				<div class={styles.positioner}>
					<Dialog.Content
						class={styles.content}
						style={{ "max-width": `${props.width ?? 420}px` }}
					>
						<Dialog.Title class={styles.title}>{props.title}</Dialog.Title>
						{props.description && (
							<Dialog.Description class={styles.description}>
								{props.description}
							</Dialog.Description>
						)}
						<div class={styles.body}>{props.children}</div>
					</Dialog.Content>
				</div>
			</Dialog.Portal>
		</Dialog>
	);
}
