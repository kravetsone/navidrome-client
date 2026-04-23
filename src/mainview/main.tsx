import "./styles/global.css";
import { render } from "solid-js/web";
import { QueryClientProvider } from "@tanstack/solid-query";
import { queryClient } from "./lib/queries";
import App from "./App";

render(
	() => (
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	),
	document.getElementById("app")!,
);
