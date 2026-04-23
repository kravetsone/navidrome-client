import Electrobun, { Electroview } from "electrobun/view";
import type { AppRPCSchema } from "../../shared/rpc-schema";

const rpc = Electroview.defineRPC<AppRPCSchema>({
	handlers: {},
});

export const electroview = new Electrobun.Electroview({ rpc });
export const appRPC = rpc;
