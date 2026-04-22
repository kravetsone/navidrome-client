import { createSignal, Show } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { ArrowRight, ChevronRight, AlertTriangle, CheckCircle2, ExternalLink, Gauge } from "lucide-solid";
import { probeServer, draftToConfig } from "../../lib/subsonic/probe";
import { InvalidEndpointError, NetworkError, SubsonicError } from "../../lib/subsonic/types";
import type { SpeedTestResult } from "../../lib/subsonic/types";
import { addServer } from "../../stores/servers";
import styles from "./ConnectView.module.css";

type AuthMode = "password" | "apiKey";

type Feedback =
	| { kind: "success"; title: string; detail: string; speed?: SpeedTestResult }
	| { kind: "error"; title: string; detail: string; helpUrl?: string };

const DEFAULT_URL = "https://";

export function ConnectView() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();

	const [url, setUrl] = createSignal(DEFAULT_URL);
	const [username, setUsername] = createSignal("");
	const [secret, setSecret] = createSignal("");
	const [authMode, setAuthMode] = createSignal<AuthMode>("password");
	const [displayName, setDisplayName] = createSignal("");
	const [advancedOpen, setAdvancedOpen] = createSignal(false);
	const [busy, setBusy] = createSignal(false);
	const [feedback, setFeedback] = createSignal<Feedback | null>(null);

	const canSubmit = () => {
		if (busy()) return false;
		const hostPart = url().trim().replace(/^https?:\/\//i, "");
		if (!hostPart) return false;
		if (!secret().trim()) return false;
		if (authMode() === "password" && !username().trim()) return false;
		return true;
	};

	const handleSubmit = async (e: Event) => {
		e.preventDefault();
		if (!canSubmit()) return;
		setBusy(true);
		setFeedback(null);

		try {
			const result = await probeServer({
				url: url(),
				username: authMode() === "password" ? username().trim() : "",
				authMode: authMode(),
				secret: secret(),
			});

			const server = draftToConfig(
				{
					url: url(),
					username: authMode() === "password" ? username().trim() : "",
					authMode: authMode(),
					secret: secret(),
				},
				result.caps,
				displayName(),
			);

			addServer(server, true);
			setFeedback({
				kind: "success",
				title: "Connected",
				detail: `${result.caps.type === "navidrome" ? "Navidrome" : result.caps.openSubsonic ? "OpenSubsonic" : "Subsonic"} ${result.caps.serverVersion}`,
				speed: result.speed,
			});

			setTimeout(() => {
				navigate(searchParams.returnTo?.toString() ?? "/", { replace: true });
			}, 1400);
		} catch (err) {
			if (err instanceof SubsonicError) {
				setFeedback({
					kind: "error",
					title: authErrorTitle(err.code),
					detail: err.message,
					helpUrl: err.helpUrl,
				});
			} else if (err instanceof InvalidEndpointError) {
				setFeedback({
					kind: "error",
					title: "Doesn't look like a Subsonic server",
					detail: [err.message, err.detail].filter(Boolean).join(" "),
				});
			} else if (err instanceof NetworkError) {
				setFeedback({
					kind: "error",
					title: "Can't reach server",
					detail: "Check the URL and your network connection.",
				});
			} else {
				setFeedback({
					kind: "error",
					title: "Something went wrong",
					detail: err instanceof Error ? err.message : String(err),
				});
			}
		} finally {
			setBusy(false);
		}
	};

	return (
		<div class={styles.connect}>
			<div class={styles.card}>
				<div class={styles.header}>
					<div class={styles.orb} />
					<span class={styles.eyebrow}>Connect</span>
					<h1 class={styles.title}>Your music, any server.</h1>
					<p class={styles.subtitle}>
						Point this app at your Navidrome, OpenSubsonic, or Subsonic-compatible server.
					</p>
				</div>

				<form class={styles.form} onSubmit={handleSubmit} autocomplete="off">
					<div class={styles.field}>
						<label class={styles.label} for="server-url">Server URL</label>
						<input
							id="server-url"
							class={styles.input}
							type="url"
							placeholder="https://music.example.com"
							value={url()}
							onInput={(e) => setUrl(e.currentTarget.value)}
							autocomplete="url"
							spellcheck={false}
							autocapitalize="off"
						/>
					</div>

					<Show when={authMode() === "password"}>
						<div class={styles.row}>
							<div class={styles.field}>
								<label class={styles.label} for="server-username">Username</label>
								<input
									id="server-username"
									class={styles.input}
									type="text"
									placeholder="alice"
									value={username()}
									onInput={(e) => setUsername(e.currentTarget.value)}
									autocomplete="username"
									spellcheck={false}
									autocapitalize="off"
								/>
							</div>
							<div class={styles.field}>
								<label class={styles.label} for="server-secret">Password</label>
								<input
									id="server-secret"
									class={styles.input}
									type="password"
									placeholder="••••••••"
									value={secret()}
									onInput={(e) => setSecret(e.currentTarget.value)}
									autocomplete="current-password"
								/>
							</div>
						</div>
					</Show>

					<Show when={authMode() === "apiKey"}>
						<div class={styles.field}>
							<label class={styles.label} for="server-apikey">API key</label>
							<input
								id="server-apikey"
								class={styles.input}
								type="password"
								placeholder="Paste your OpenSubsonic API key"
								value={secret()}
								onInput={(e) => setSecret(e.currentTarget.value)}
								autocomplete="off"
								spellcheck={false}
							/>
						</div>
					</Show>

					<button
						type="button"
						class={styles.toggleRow}
						data-open={advancedOpen()}
						onClick={() => setAdvancedOpen(!advancedOpen())}
					>
						<ChevronRight />
						Advanced options
					</button>

					<Show when={advancedOpen()}>
						<div class={styles.advanced}>
							<div class={styles.field}>
								<span class={styles.label}>Authentication</span>
								<div class={styles.authSwitch}>
									<button
										type="button"
										class={styles.authOption}
										data-active={authMode() === "password"}
										onClick={() => setAuthMode("password")}
									>
										Password
									</button>
									<button
										type="button"
										class={styles.authOption}
										data-active={authMode() === "apiKey"}
										onClick={() => setAuthMode("apiKey")}
									>
										API key
									</button>
								</div>
							</div>
							<div class={styles.field}>
								<label class={styles.label} for="server-name">Display name (optional)</label>
								<input
									id="server-name"
									class={styles.input}
									type="text"
									placeholder="Home"
									value={displayName()}
									onInput={(e) => setDisplayName(e.currentTarget.value)}
								/>
							</div>
						</div>
					</Show>

					<Show when={feedback()}>
						{(fb) => {
							const value = fb();
							const helpUrl = value.kind === "error" ? value.helpUrl : undefined;
							const speed = value.kind === "success" ? value.speed : undefined;
							return (
								<div class={styles.feedback} data-kind={value.kind}>
									{value.kind === "error" ? <AlertTriangle /> : <CheckCircle2 />}
									<div class={styles.feedbackBody}>
										<span class={styles.feedbackTitle}>{value.title}</span>
										<span class={styles.feedbackHint}>{value.detail}</span>
										<Show when={speed}>
											{(s) => (
												<div class={styles.speedRow}>
													<Gauge size={12} />
													<span class={styles.speedMetric}>
														<span class={styles.speedLabel}>Latency</span>
														<span class={styles.speedValue}>{formatPing(s().pingMs)}</span>
													</span>
													<Show when={s().throughputMbps !== undefined}>
														<span class={styles.speedMetric}>
															<span class={styles.speedLabel}>Throughput</span>
															<span class={styles.speedValue}>
																{formatThroughput(s().throughputMbps!)}
															</span>
														</span>
													</Show>
												</div>
											)}
										</Show>
										<Show when={helpUrl}>
											{(href) => (
												<a
													href={href()}
													target="_blank"
													rel="noreferrer"
													class={styles.feedbackLink}
												>
													Learn more <ExternalLink size={12} />
												</a>
											)}
										</Show>
									</div>
								</div>
							);
						}}
					</Show>

					<button
						type="submit"
						class={styles.submit}
						disabled={!canSubmit()}
					>
						<Show when={busy()} fallback={<>Connect <ArrowRight /></>}>
							<span class={styles.spinner} />
							Testing connection
						</Show>
					</button>
				</form>
			</div>
		</div>
	);
}

function formatPing(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return "—";
	if (ms < 10) return `${ms.toFixed(1)} ms`;
	return `${Math.round(ms)} ms`;
}

function formatThroughput(mbps: number): string {
	if (!Number.isFinite(mbps) || mbps <= 0) return "—";
	if (mbps >= 100) return `${Math.round(mbps)} Mbps`;
	if (mbps >= 10) return `${mbps.toFixed(1)} Mbps`;
	return `${mbps.toFixed(2)} Mbps`;
}

function authErrorTitle(code: number): string {
	switch (code) {
		case 40: return "Wrong username or password";
		case 41: return "Token authentication not supported on this server";
		case 42: return "Authentication mechanism unsupported";
		case 43: return "Conflicting authentication methods";
		case 44: return "Invalid API key";
		case 50: return "Not authorized";
		default: return "Server rejected the request";
	}
}
