import { For, Show, onMount } from "solid-js";
import { A } from "@solidjs/router";
import { useStore } from "@nanostores/solid";
import { Plus, Trash2, Radio, Server, Check } from "lucide-solid";
import {
	$servers,
	$activeServerId,
	$status,
	setActive,
	removeServer,
	pingActive,
} from "../../stores/servers";
import type { ServerCaps } from "../../lib/subsonic/types";
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
	server: { id: string; name: string; url: string; caps?: ServerCaps };
	isActive: boolean;
	status: "unknown" | "connecting" | "online" | "offline";
	onActivate: () => void;
	onRemove: () => void;
}) {
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
		const username = (props.server as unknown as { username?: string }).username;
		return `${caps.serverVersion}${username ? ` · ${username}` : ""}`;
	};

	return (
		<div class={styles.serverCard} data-active={props.isActive}>
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
	);
}
