import { For, Show, type JSX } from "solid-js";
import { Palette } from "lucide-solid";
import styles from "./controls.module.css";
import {
	ACCENT_SWATCHES,
	accentSwatch,
} from "../../../lib/accent-palette";
import type { AccentName } from "../../../stores/preferences";

// ─── Pane ──────────────────────────────────────────────────────────────────

export function Pane(props: {
	eyebrow: string;
	title: string;
	description?: string;
	children: JSX.Element;
}) {
	return (
		<div class={styles.pane}>
			<header class={styles.paneHead}>
				<span class={styles.paneEyebrow}>{props.eyebrow}</span>
				<h1 class={styles.paneTitle}>{props.title}</h1>
				<Show when={props.description}>
					<p class={styles.paneDescription}>{props.description}</p>
				</Show>
			</header>
			<div class={styles.paneBody}>{props.children}</div>
		</div>
	);
}

// ─── Section (groups rows) ─────────────────────────────────────────────────

export function Section(props: { title?: string; children: JSX.Element }) {
	return (
		<section class={styles.section}>
			<Show when={props.title}>
				<div class={styles.sectionTitle}>{props.title}</div>
			</Show>
			{props.children}
		</section>
	);
}

// ─── Row ───────────────────────────────────────────────────────────────────

export function Row(props: {
	title: string;
	hint?: string;
	orientation?: "inline" | "stack";
	children: JSX.Element;
}) {
	return (
		<div class={styles.row} data-orientation={props.orientation ?? "inline"}>
			<div class={styles.rowLabel}>
				<span class={styles.rowTitle}>{props.title}</span>
				<Show when={props.hint}>
					<span class={styles.rowHint}>{props.hint}</span>
				</Show>
			</div>
			<div class={styles.rowControl}>{props.children}</div>
		</div>
	);
}

// ─── Toggle ────────────────────────────────────────────────────────────────

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void }) {
	return (
		<label class={styles.toggle}>
			<input
				type="checkbox"
				checked={props.checked}
				onChange={(e) => props.onChange(e.currentTarget.checked)}
			/>
			<span class={styles.toggleTrack} />
			<span class={styles.toggleThumb} />
		</label>
	);
}

// ─── Segmented control ────────────────────────────────────────────────────

export interface SegmentOption<T extends string | number> {
	value: T;
	label: string;
	disabled?: boolean;
}

export function Segmented<T extends string | number>(props: {
	value: T;
	onChange: (v: T) => void;
	options: SegmentOption<T>[];
}) {
	return (
		<div class={styles.segmented} role="tablist">
			<For each={props.options}>
				{(opt) => (
					<button
						type="button"
						class={styles.segmentedItem}
						data-selected={opt.value === props.value ? "true" : undefined}
						disabled={opt.disabled}
						onClick={() => props.onChange(opt.value)}
					>
						{opt.label}
					</button>
				)}
			</For>
		</div>
	);
}

// ─── Slider ────────────────────────────────────────────────────────────────

export function Slider(props: {
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (v: number) => void;
	format?: (v: number) => string;
}) {
	const progress = () =>
		((props.value - props.min) / (props.max - props.min)) * 100;
	return (
		<div class={styles.slider}>
			<input
				type="range"
				class={styles.sliderTrack}
				min={props.min}
				max={props.max}
				step={props.step ?? 1}
				value={props.value}
				style={{ "--progress": `${progress()}%` }}
				onInput={(e) => props.onChange(Number(e.currentTarget.value))}
			/>
			<span class={styles.sliderValue}>
				{props.format ? props.format(props.value) : props.value}
			</span>
		</div>
	);
}

// ─── Swatch picker (accent color) ──────────────────────────────────────────

export function SwatchPicker(props: {
	value: AccentName;
	customHex: string;
	onChange: (accent: AccentName, customHex: string) => void;
}) {
	return (
		<div class={styles.swatches}>
			<For each={Object.values(ACCENT_SWATCHES)}>
				{(sw) => (
					<button
						type="button"
						class={styles.swatch}
						style={{
							background: sw.base,
							"--swatch-color": sw.base,
						}}
						data-selected={props.value === sw.name ? "true" : undefined}
						onClick={() => props.onChange(sw.name, props.customHex)}
						aria-label={sw.label}
						title={sw.label}
					/>
				)}
			</For>
			<label
				class={styles.swatchCustom}
				data-selected={props.value === "custom" ? "true" : undefined}
				title="Custom color"
				style={{
					background:
						props.value === "custom"
							? accentSwatch("custom", props.customHex).base
							: undefined,
				}}
			>
				<Show when={props.value !== "custom"}>
					<Palette size={14} />
				</Show>
				<input
					type="color"
					value={props.customHex}
					onInput={(e) => props.onChange("custom", e.currentTarget.value)}
				/>
			</label>
		</div>
	);
}
