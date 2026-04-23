import { atom } from "nanostores";

export type ToastVariant = "info" | "error" | "success";

export interface ToastEntry {
	id: number;
	message: string;
	variant: ToastVariant;
	createdAt: number;
}

const DEFAULT_DURATION = 4000;
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const $toasts = atom<ToastEntry[]>([]);

export function pushToast(
	message: string,
	options: { variant?: ToastVariant; duration?: number } = {},
): number {
	const id = nextId++;
	const entry: ToastEntry = {
		id,
		message,
		variant: options.variant ?? "info",
		createdAt: Date.now(),
	};
	$toasts.set([...$toasts.get(), entry]);
	const t = setTimeout(() => dismissToast(id), options.duration ?? DEFAULT_DURATION);
	timers.set(id, t);
	return id;
}

export function dismissToast(id: number) {
	const timer = timers.get(id);
	if (timer) {
		clearTimeout(timer);
		timers.delete(id);
	}
	$toasts.set($toasts.get().filter((t) => t.id !== id));
}

export function toastError(err: unknown, prefix?: string) {
	const message =
		err instanceof Error
			? err.message
			: typeof err === "string"
				? err
				: "Something went wrong.";
	return pushToast(prefix ? `${prefix}: ${message}` : message, {
		variant: "error",
	});
}
