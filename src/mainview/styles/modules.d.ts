declare module "*.module.css" {
	const classes: Readonly<Record<string, string>>;
	export default classes;
}

declare module "three";
declare module "@babylonjs/core";
