import { Client as DiscordClient } from "@xhayper/discord-rpc";
import { DISCORD_CLIENT_ID, type PresencePayload } from "../shared/discord";
import { getCoverArtUrl } from "./cover-art";

const ACTIVITY_TYPE_LISTENING = 2;
const RECONNECT_DELAY_MS = 15_000;

class DiscordPresence {
	private client: DiscordClient | null = null;
	private ready = false;
	private connecting = false;
	private pending: PresencePayload | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private flushSeq = 0;

	start() {
		this.tryConnect();
	}

	async stop() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.client && this.ready) {
			try {
				await this.client.user?.clearActivity();
			} catch {}
			try {
				await this.client.destroy();
			} catch {}
		}
		this.client = null;
		this.ready = false;
	}

	setActivity(payload: PresencePayload) {
		this.pending = payload;
		if (this.ready) this.flush();
	}

	clear() {
		this.pending = null;
		if (this.ready && this.client) {
			this.client.user?.clearActivity().catch(() => {});
		}
	}

	private async flush() {
		if (!this.ready || !this.client || !this.pending) return;
		const seq = ++this.flushSeq;
		const p = this.pending;

		const coverUrl = await getCoverArtUrl(p.artist, p.album);
		if (seq !== this.flushSeq) return;
		if (!this.ready || !this.client || !this.pending) return;

		const activity: Parameters<
			NonNullable<DiscordClient["user"]>["setActivity"]
		>[0] = {
			type: ACTIVITY_TYPE_LISTENING,
			details: p.title,
			state: p.artist ? `by ${p.artist}` : undefined,
			largeImageText: p.album,
		};
		if (coverUrl) {
			activity.largeImageUrl = coverUrl;
		}
		if (p.isPlaying && p.duration && p.duration > 0) {
			const now = Date.now();
			const pos = Math.max(0, Math.min(p.position ?? 0, p.duration));
			activity.startTimestamp = now - pos * 1000;
			activity.endTimestamp = now + (p.duration - pos) * 1000;
		}
		try {
			await this.client.user?.setActivity(activity);
		} catch (err) {
			console.warn("[discord-rpc] setActivity failed:", err);
			this.handleDisconnect();
		}
	}

	private tryConnect() {
		if (this.connecting || this.ready) return;
		this.connecting = true;

		const client = new DiscordClient({ clientId: DISCORD_CLIENT_ID });
		this.client = client;

		client.on("ready", () => {
			this.ready = true;
			this.connecting = false;
			if (this.pending) this.flush();
		});

		client.on("disconnected", () => this.handleDisconnect());

		client.login().catch(() => {
			this.connecting = false;
			this.scheduleReconnect();
		});
	}

	private handleDisconnect() {
		this.ready = false;
		this.connecting = false;
		if (this.client) {
			this.client.destroy().catch(() => {});
			this.client = null;
		}
		this.scheduleReconnect();
	}

	private scheduleReconnect() {
		if (this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.tryConnect();
		}, RECONNECT_DELAY_MS);
	}
}

export const discordPresence = new DiscordPresence();
