import { QueryClient } from "@tanstack/solid-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000,
			gcTime: 10 * 60 * 1000,
			refetchOnWindowFocus: false,
			retry: (failureCount, error) => {
				const name = (error as { name?: string })?.name;
				if (name === "SubsonicError" || name === "InvalidEndpointError") return false;
				return failureCount < 2;
			},
		},
	},
});
