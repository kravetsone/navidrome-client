import { For, type JSX } from "solid-js";
import { useStore } from "@nanostores/solid";
import { atom } from "nanostores";
import {
	Palette,
	Sliders,
	Radio,
	MessageCircle,
	Server,
	Wrench,
	Info,
	type LucideProps,
} from "lucide-solid";
import styles from "./SettingsSidebar.module.css";

export type SettingsPaneId =
	| "appearance"
	| "playback"
	| "streaming"
	| "discord"
	| "servers"
	| "advanced"
	| "about";

export const $settingsPane = atom<SettingsPaneId>("appearance");

interface Item {
	id: SettingsPaneId;
	label: string;
	icon: (p: LucideProps) => JSX.Element;
}

interface Group {
	name: string;
	items: Item[];
}

const GROUPS: Group[] = [
	{
		name: "Experience",
		items: [
			{ id: "appearance", label: "Appearance", icon: Palette },
			{ id: "playback", label: "Playback", icon: Sliders },
			{ id: "streaming", label: "Streaming", icon: Radio },
		],
	},
	{
		name: "Integrations",
		items: [
			{ id: "discord", label: "Discord", icon: MessageCircle },
			{ id: "servers", label: "Servers", icon: Server },
		],
	},
	{
		name: "System",
		items: [
			{ id: "advanced", label: "Advanced", icon: Wrench },
			{ id: "about", label: "About", icon: Info },
		],
	},
];

export function SettingsSidebar() {
	const active = useStore($settingsPane);
	return (
		<nav class={styles.sidebar}>
			<For each={GROUPS}>
				{(group) => (
					<div class={styles.group}>
						<div class={styles.groupHead}>{group.name}</div>
						<For each={group.items}>
							{(item) => {
								const Icon = item.icon;
								return (
									<button
										type="button"
										class={styles.item}
										data-active={active() === item.id ? "true" : undefined}
										onClick={() => $settingsPane.set(item.id)}
									>
										<Icon class={styles.icon} size={16} />
										<span>{item.label}</span>
									</button>
								);
							}}
						</For>
					</div>
				)}
			</For>
		</nav>
	);
}
