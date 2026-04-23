import { ContextMenu as Kobalte } from "@kobalte/core/context-menu";
import { For, Show, type JSX, type ValidComponent } from "solid-js";
import styles from "./ContextMenu.module.css";

export interface MenuItem {
	label: string;
	icon?: JSX.Element;
	shortcut?: string;
	onSelect?: () => void;
	disabled?: boolean;
	destructive?: boolean;
	submenu?: MenuItem[];
	separatorAfter?: boolean;
}

export interface ContextMenuProps {
	items: MenuItem[];
	children: JSX.Element;
	/** Element type for the trigger wrapper. Defaults to "div". */
	as?: ValidComponent;
	triggerClass?: string;
	triggerProps?: Record<string, unknown>;
}

export function ContextMenu(props: ContextMenuProps) {
	return (
		<Kobalte>
			<Kobalte.Trigger
				as={(props.as as ValidComponent) ?? "div"}
				class={props.triggerClass ?? styles.trigger}
				{...(props.triggerProps ?? {})}
			>
				{props.children}
			</Kobalte.Trigger>
			<Kobalte.Portal>
				<Kobalte.Content class={styles.content}>
					<MenuItems items={props.items} />
				</Kobalte.Content>
			</Kobalte.Portal>
		</Kobalte>
	);
}

function MenuItems(props: { items: MenuItem[] }) {
	return (
		<For each={props.items}>
			{(item) => (
				<>
					<Show
						when={item.submenu && item.submenu.length > 0}
						fallback={
							<Kobalte.Item
								class={styles.item}
								data-destructive={item.destructive ? "true" : undefined}
								disabled={item.disabled}
								onSelect={() => item.onSelect?.()}
							>
								<span class={styles.icon}>{item.icon}</span>
								<span class={styles.label}>{item.label}</span>
								<Show when={item.shortcut}>
									<span class={styles.shortcut}>{item.shortcut}</span>
								</Show>
							</Kobalte.Item>
						}
					>
						<Kobalte.Sub overlap gutter={4} shift={-8}>
							<Kobalte.SubTrigger
								class={styles.item}
								disabled={item.disabled}
							>
								<span class={styles.icon}>{item.icon}</span>
								<span class={styles.label}>{item.label}</span>
								<span class={styles.subArrow}>›</span>
							</Kobalte.SubTrigger>
							<Kobalte.Portal>
								<Kobalte.SubContent class={styles.content}>
									<MenuItems items={item.submenu!} />
								</Kobalte.SubContent>
							</Kobalte.Portal>
						</Kobalte.Sub>
					</Show>
					<Show when={item.separatorAfter}>
						<Kobalte.Separator class={styles.separator} />
					</Show>
				</>
			)}
		</For>
	);
}
