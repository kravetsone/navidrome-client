import { For } from "solid-js";
import { A, useLocation } from "@solidjs/router";
import {
	Home,
	Disc3,
	Mic2,
	ListMusic,
	Heart,
	Clock,
	Settings,
} from "lucide-solid";
import styles from "./Sidebar.module.css";

type NavItem = { href: string; label: string; icon: typeof Home };

const library: NavItem[] = [
	{ href: "/", label: "Home", icon: Home },
	{ href: "/albums", label: "Albums", icon: Disc3 },
	{ href: "/artists", label: "Artists", icon: Mic2 },
	{ href: "/playlists", label: "Playlists", icon: ListMusic },
];

const personal: NavItem[] = [
	{ href: "/favorites", label: "Favorites", icon: Heart },
	{ href: "/recent", label: "Recently played", icon: Clock },
];

export function Sidebar() {
	const location = useLocation();
	const isActive = (href: string) =>
		href === "/" ? location.pathname === "/" : location.pathname.startsWith(href);

	return (
		<nav class={styles.sidebar}>
			<div class={styles.header}>
				<span class={styles.brand}>Navidrome</span>
			</div>

			<div class={styles.section}>
				<span class={styles.sectionLabel}>Library</span>
				<For each={library}>
					{(item) => (
						<A
							href={item.href}
							class={styles.item}
							data-active={isActive(item.href)}
						>
							<item.icon />
							<span>{item.label}</span>
						</A>
					)}
				</For>
			</div>

			<div class={styles.section}>
				<span class={styles.sectionLabel}>You</span>
				<For each={personal}>
					{(item) => (
						<A
							href={item.href}
							class={styles.item}
							data-active={isActive(item.href)}
						>
							<item.icon />
							<span>{item.label}</span>
						</A>
					)}
				</For>
			</div>

			<div class={styles.spacer} />

			<div class={styles.footer}>
				<div class={styles.server} data-status="disconnected">
					<span class={styles.serverDot} />
					<div class={styles.serverText}>
						<span class={styles.serverLabel}>Server</span>
						<span class={styles.serverValue}>Not connected</span>
					</div>
					<A href="/settings" class={styles.item} style={{ padding: "6px" }}>
						<Settings />
					</A>
				</div>
			</div>
		</nav>
	);
}
