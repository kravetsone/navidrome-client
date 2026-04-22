import { createEffect, type JSX } from "solid-js";
import { useNavigate, useLocation } from "@solidjs/router";
import { useStore } from "@nanostores/solid";
import { $hasServers } from "../stores/servers";

const OPEN_ROUTES = new Set<string>(["/connect"]);

export function ServerGuard(props: { children: JSX.Element }) {
	const navigate = useNavigate();
	const location = useLocation();
	const hasServers = useStore($hasServers);

	createEffect(() => {
		const path = location.pathname;
		if (!hasServers() && !OPEN_ROUTES.has(path)) {
			navigate("/connect", { replace: true });
		}
	});

	return <>{props.children}</>;
}
