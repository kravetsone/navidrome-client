import { Show } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Heart } from "lucide-solid";
import { useStore } from "@nanostores/solid";
import { $activeServer } from "../stores/servers";
import { clientFor } from "../lib/queries/useActiveClient";
import { starMutation, type StarKind } from "../lib/queries/mutations";
import styles from "./HeartButton.module.css";

export interface HeartButtonProps {
	kind: StarKind;
	id: string;
	starred: boolean;
	size?: number;
	compact?: boolean;
	label?: string;
}

export function HeartButton(props: HeartButtonProps) {
	const activeServer = useStore($activeServer);
	const queryClient = useQueryClient();

	const mutation = createMutation(() => {
		const server = activeServer();
		if (!server) {
			return {
				mutationFn: async () => {},
			};
		}
		return starMutation({
			client: clientFor(server),
			serverId: server.id,
			queryClient,
		});
	});

	const handleClick = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		const server = activeServer();
		if (!server) return;
		mutation.mutate({ kind: props.kind, id: props.id, starred: !props.starred });
		(e.currentTarget as HTMLElement).blur();
	};

	const handleContext = (e: MouseEvent) => {
		e.stopPropagation();
	};

	return (
		<button
			type="button"
			class={styles.heart}
			data-active={props.starred}
			data-compact={props.compact ? "true" : "false"}
			onClick={handleClick}
			onContextMenu={handleContext}
			aria-label={
				props.label ?? (props.starred ? "Remove from favorites" : "Add to favorites")
			}
			aria-pressed={props.starred}
		>
			<Heart
				size={props.size ?? 16}
				fill={props.starred ? "currentColor" : "none"}
				strokeWidth={2}
			/>
			<Show when={!props.compact && (props.label ?? null)}>
				<span>{props.label}</span>
			</Show>
		</button>
	);
}
