import { For, Show } from "solid-js";
import { useStore } from "@nanostores/solid";
import { createQuery } from "@tanstack/solid-query";
import { Globe, Users } from "lucide-solid";
import { communityServersQuery, type CommunityServer } from "../../lib/queries";
import { normalizeServerUrl } from "../../lib/subsonic/client";
import { $servers } from "../../stores/servers";
import styles from "./CommunityServers.module.css";

export function CommunityServers(props: {
	onPick: (server: CommunityServer) => void;
	variant?: "onboarding" | "pane";
}) {
	const query = createQuery(() => communityServersQuery());
	const connected = useStore($servers);

	const servers = () => {
		const all = query.data?.servers ?? [];
		const taken = new Set(connected().map((s) => normalizeServerUrl(s.url)));
		return all.filter((s) => !taken.has(normalizeServerUrl(s.url)));
	};

	return (
		<Show when={servers().length > 0}>
			<section class={styles.section} data-variant={props.variant ?? "onboarding"}>
				<header class={styles.header}>
					<span class={styles.eyebrow}>
						<Users size={12} /> Community
					</span>
					<h2 class={styles.title}>Try a shared server</h2>
					<p class={styles.hint}>
						Open instances maintained by the community. Credentials are public —
						use them to explore, not to store anything private.
					</p>
				</header>

				<div class={styles.grid}>
					<For each={servers()}>
						{(server) => (
							<button
								type="button"
								class={styles.card}
								onClick={() => props.onPick(server)}
							>
								<span class={styles.cardHead}>
									<span class={styles.flag}>{server.flag ?? <Globe size={14} />}</span>
									<span class={styles.name}>{server.name}</span>
									<span class={styles.badge} data-type={server.type}>
										{labelForType(server.type)}
									</span>
								</span>
								<span class={styles.description}>{server.description}</span>
								<span class={styles.url}>{prettyUrl(server.url)}</span>
							</button>
						)}
					</For>
				</div>
			</section>
		</Show>
	);
}

function labelForType(t: CommunityServer["type"]): string {
	if (t === "navidrome") return "Navidrome";
	if (t === "opensubsonic") return "OpenSubsonic";
	return "Subsonic";
}

function prettyUrl(url: string): string {
	return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
