export type ServerType = "navidrome" | "opensubsonic" | "subsonic";
export type AuthMode = "apiKey" | "password";

export interface OpenSubsonicExtension {
	name: string;
	versions: number[];
}

export interface ServerCaps {
	type: ServerType;
	serverVersion: string;
	serverName?: string;
	openSubsonic: boolean;
	extensions: OpenSubsonicExtension[];
	lastProbedAt: number;
}

export interface ServerConfig {
	id: string;
	name: string;
	url: string;
	username: string;
	authMode: AuthMode;
	secret: string;
	caps?: ServerCaps;
}

export interface SubsonicResponse {
	status: "ok" | "failed";
	version: string;
	type?: string;
	serverVersion?: string;
	serverName?: string;
	openSubsonic?: boolean;
	error?: { code: number; message: string; helpUrl?: string };
	[key: string]: unknown;
}

export class SubsonicError extends Error {
	readonly code: number;
	readonly helpUrl?: string;

	constructor(code: number, message: string, helpUrl?: string) {
		super(message);
		this.name = "SubsonicError";
		this.code = code;
		this.helpUrl = helpUrl;
	}
}

export class NetworkError extends Error {
	constructor(message: string, public readonly cause?: unknown) {
		super(message);
		this.name = "NetworkError";
	}
}

export class InvalidEndpointError extends Error {
	constructor(message: string, public readonly detail?: string) {
		super(message);
		this.name = "InvalidEndpointError";
	}
}

export type SpeedTestPhase = "idle" | "ping" | "stream" | "done" | "error" | "cancelled";

export interface SpeedTestResult {
	phase: SpeedTestPhase;
	pingMs?: number;
	jitterMs?: number;
	ttfbMs?: number;
	throughputMbps?: number;
	peakMbps?: number;
	bytes?: number;
	targetBytes?: number;
	durationMs?: number;
	error?: string;
}
