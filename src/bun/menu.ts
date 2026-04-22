import { ApplicationMenu } from "electrobun/bun";

const APP_NAME = "Navidrome";

export function installApplicationMenu() {
	ApplicationMenu.setApplicationMenu([
		{
			label: APP_NAME,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "hide", accelerator: "Cmd+H" },
				{ role: "hideOthers", accelerator: "Cmd+Alt+H" },
				{ role: "showAll" },
				{ type: "separator" },
				{ role: "quit", accelerator: "Cmd+Q" },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo", accelerator: "Cmd+Z" },
				{ role: "redo", accelerator: "Cmd+Shift+Z" },
				{ type: "separator" },
				{ role: "cut", accelerator: "Cmd+X" },
				{ role: "copy", accelerator: "Cmd+C" },
				{ role: "paste", accelerator: "Cmd+V" },
				{ role: "pasteAndMatchStyle", accelerator: "Cmd+Shift+Alt+V" },
				{ role: "selectAll", accelerator: "Cmd+A" },
				{ role: "delete" },
			],
		},
		{
			label: "View",
			submenu: [
				{
					label: "Toggle Full Screen",
					role: "toggleFullScreen",
					accelerator: "Ctrl+Cmd+F",
				},
			],
		},
		{
			label: "Window",
			submenu: [
				{ role: "minimize", accelerator: "Cmd+M" },
				{ role: "zoom" },
				{ type: "separator" },
				{ role: "close", accelerator: "Cmd+W" },
				{ role: "bringAllToFront" },
			],
		},
	]);
}
