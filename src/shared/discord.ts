export const DISCORD_CLIENT_ID = "1496678359445409812";

export interface PresencePayload {
	title: string;
	artist?: string;
	album?: string;
	duration?: number;
	position?: number;
	isPlaying: boolean;
}
