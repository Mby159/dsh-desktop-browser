import type { Service } from "@deepseek-ai/cordis";
import type { z } from "@deepseek-ai/schemastery";

export interface Config {
	url?: string;
	browser?: string;
	width?: number;
	height?: number;
	positionX?: number | "auto";
	positionY?: number | "auto";
	disableExtensions?: boolean;
	openDelayMs?: number;
	minimize?: boolean;
	closeOnBrowserExit?: boolean;
	closeDelayMs?: number;
	desktopShortcut?: boolean;
	shortcutName?: string;
}

export declare const Config: z<Config>;
export declare class DesktopBrowser extends Service {
	static Config: z<Config>;
	static inject: readonly ["webServer"];
	readonly config: Config & {
		width: number;
		height: number;
		positionX: number | "auto";
		positionY: number | "auto";
		disableExtensions: boolean;
		openDelayMs: number;
		minimize: boolean;
		closeOnBrowserExit: boolean;
		closeDelayMs: number;
		desktopShortcut: boolean;
		shortcutName: string;
	};
	get url(): string | undefined;
	get running(): boolean;
	open(): void;
	close(): void;
}

export default DesktopBrowser;
