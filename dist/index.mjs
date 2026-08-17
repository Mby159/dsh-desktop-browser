import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
//#region src/index.ts
/**
* @deepseek-ai/dsh-desktop-browser — Host plugin that opens the dsh Web UI
* in a browser window with the address bar hidden (--app mode).
*
* @module @deepseek-ai/dsh-desktop-browser
*/
const Config = z.object({
	url: z.string().optional(),
	browser: z.string().optional(),
	width: z.natural().default(1400),
	height: z.natural().default(900),
	positionX: z.union([z.number(), z.const("auto")]).default("auto"),
	positionY: z.union([z.number(), z.const("auto")]).default("auto"),
	disableExtensions: z.boolean().default(true),
	openDelayMs: z.natural().default(500),
	minimize: z.boolean().default(false)
});
function findFirst(candidates) {
	for (const p of candidates) if (existsSync(p)) return p;
}
/** Query Windows registry for the user's default HTTP handler. */
function defaultBrowserWindows() {
	try {
		const match = execSync("reg query \"HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice\" /v ProgId 2>&1", {
			encoding: "utf-8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).match(/ProgId\s+REG_SZ\s+(.+)/i);
		if (!match || !match[1]) return void 0;
		const id = match[1].trim().replace(/^"|"$/g, "");
		const cmdMatch = execSync(`reg query "HKLM\\SOFTWARE\\Classes\\${id}\\shell\\open\\command" /ve 2>&1`, {
			encoding: "utf-8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		}).match(/"([^"]*\.exe)"/i);
		if (cmdMatch && cmdMatch[1]) return cmdMatch[1].trim();
		return;
	} catch {
		return;
	}
}
function detectWindowsBrowsers() {
	const entries = [];
	const defaultPath = defaultBrowserWindows();
	if (defaultPath) entries.push({
		path: defaultPath,
		kind: "other"
	});
	const localAppData = (process.env["LOCALAPPDATA"] ?? `${homedir()}/AppData/Local`).replace(/\\/g, "/");
	const programFiles = (process.env["PROGRAMFILES"] ?? "C:/Program Files").replace(/\\/g, "/");
	const programFilesX86 = (process.env["PROGRAMFILES(X86)"] ?? "C:/Program Files (x86)").replace(/\\/g, "/");
	const chromePath = findFirst([
		`${localAppData}/Google/Chrome/Application/chrome.exe`,
		`${programFiles}/Google/Chrome/Application/chrome.exe`,
		`${programFilesX86}/Google/Chrome/Application/chrome.exe`
	]);
	if (chromePath) entries.push({
		path: chromePath,
		kind: "chrome"
	});
	const edgePath = findFirst([
		`${localAppData}/Microsoft/Edge/Application/msedge.exe`,
		`${programFiles}/Microsoft/Edge/Application/msedge.exe`,
		`${programFilesX86}/Microsoft/Edge/Application/msedge.exe`
	]);
	if (edgePath) entries.push({
		path: edgePath,
		kind: "edge"
	});
	return entries;
}
function detectMacBrowsers() {
	const entries = [];
	const appDirs = ["/Applications", `${homedir()}/Applications`];
	const rels = [
		{
			rel: "Google Chrome.app/Contents/MacOS/Google Chrome",
			kind: "chrome"
		},
		{
			rel: "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			kind: "edge"
		},
		{
			rel: "Chromium.app/Contents/MacOS/Chromium",
			kind: "chromium"
		},
		{
			rel: "Brave Browser.app/Contents/MacOS/Brave Browser",
			kind: "chrome"
		}
	];
	for (const d of appDirs) for (const { rel, kind } of rels) {
		const p = `${d}/${rel}`;
		if (existsSync(p)) entries.push({
			path: p,
			kind
		});
	}
	if (existsSync("/Applications/Safari.app/Contents/MacOS/Safari")) entries.push({
		path: "/Applications/Safari.app/Contents/MacOS/Safari",
		kind: "safari"
	});
	return entries;
}
function detectLinuxBrowsers() {
	return [
		{
			path: "/usr/bin/google-chrome",
			kind: "chrome"
		},
		{
			path: "/usr/bin/google-chrome-stable",
			kind: "chrome"
		},
		{
			path: "/usr/bin/chromium-browser",
			kind: "chromium"
		},
		{
			path: "/usr/bin/chromium",
			kind: "chromium"
		},
		{
			path: "/snap/bin/chromium",
			kind: "chromium"
		},
		{
			path: "/snap/bin/google-chrome",
			kind: "chrome"
		}
	].filter((c) => existsSync(c.path));
}
function resolveGeometry(config) {
	const width = config.width ?? 1400;
	const height = config.height ?? 900;
	const posX = config.positionX === "auto" ? -1 : config.positionX ?? -1;
	const posY = config.positionY === "auto" ? -1 : config.positionY ?? -1;
	if (posX >= 0 && posY >= 0) return `${width}x${height}+${posX}+${posY}`;
	if (posX >= 0) return `${width}x${height}+${posX}`;
	if (posY >= 0) return `${width}x${height}+0+${posY}`;
	return `${width}x${height}`;
}
var DesktopBrowser = class extends Service {
	static Config = Config;
	static inject = ["webServer"];
	config;
	browserProcess = null;
	openTimer = null;
	resolvedUrl;
	constructor(ctx, config) {
		super(ctx, "desktopBrowser");
		this.config = config;
	}
	get url() {
		return this.resolvedUrl;
	}
	get running() {
		return this.browserProcess !== null;
	}
	open() {
		if (this.browserProcess) {
			this.ctx.logger.info("desktopBrowser: already running");
			return;
		}
		const url = this.resolvedUrl ?? this.config.url ?? "http://127.0.0.1:3080";
		const args = this.buildArgs(url);
		const chromiumPath = this.findChromiumBrowser();
		if (chromiumPath) {
			this.ctx.logger.info(`desktopBrowser: launching ${chromiumPath} with URL ${url}`);
			this.browserProcess = spawn(chromiumPath, args, {
				stdio: "ignore",
				detached: true
			});
		} else {
			const opener = platform() === "win32" ? "cmd" : platform() === "darwin" ? "open" : "xdg-open";
			const openerArgs = platform() === "win32" ? [
				"/c",
				"start",
				"",
				url
			] : [url];
			this.ctx.logger.warn(`desktopBrowser: no Chromium browser found, opening ${url} with default browser (will retain address bar)`);
			this.browserProcess = spawn(opener, openerArgs, {
				stdio: "ignore",
				detached: true
			});
		}
		this.browserProcess.on("error", (err) => {
			this.ctx.logger.error(`desktopBrowser: process error: ${err.message}`);
			this.browserProcess = null;
		});
		this.browserProcess.on("exit", (code) => {
			this.ctx.logger.info(`desktopBrowser: browser exited (code=${code})`);
			this.browserProcess = null;
		});
		this.browserProcess.unref();
	}
	/** Find a Chromium-based browser installed on the system, or undefined. */
	findChromiumBrowser() {
		if (this.config.browser && existsSync(this.config.browser)) return this.config.browser.replace(/\\/g, "/");
		const detected = this.detectBrowsers();
		for (const kind of [
			"chrome",
			"edge",
			"chromium",
			"other"
		]) {
			const found = detected.find((b) => b.kind === kind);
			if (found) {
				const b = found.path.toLowerCase();
				if (b.includes("chrome") || b.includes("edge") || b.includes("chromium") || b.includes("brave")) return found.path.replace(/\\/g, "/");
			}
		}
	}
	close() {
		if (this.openTimer) {
			clearTimeout(this.openTimer);
			this.openTimer = null;
		}
		if (this.browserProcess) {
			this.ctx.logger.info("desktopBrowser: closing browser");
			this.browserProcess.kill("SIGTERM");
			this.browserProcess = null;
		} else this.ctx.logger.info("desktopBrowser: not running");
	}
	async [Service.init]() {
		const webserver = this.ctx.webServer;
		const host = webserver?.host ?? this.config.url?.match(/^http:\/\/([^\/:]+)/)?.[1] ?? "127.0.0.1";
		const port = webserver?.port ?? Number(this.config.url?.match(/:(\d+)/)?.[1] ?? "3080");
		this.resolvedUrl = `http://${host}:${port}`;
		this.ctx.logger.info(`desktopBrowser: ready — will open ${this.resolvedUrl}`);
		this.openTimer = setTimeout(() => {
			this.open();
		}, this.config.openDelayMs);
		this.ctx.effect(() => () => {
			this.close();
		}, "desktopBrowser.open");
	}
	detectBrowsers() {
		const os = platform();
		return os === "win32" ? detectWindowsBrowsers() : os === "darwin" ? detectMacBrowsers() : detectLinuxBrowsers();
	}
	buildArgs(url) {
		const args = [];
		const geometry = resolveGeometry(this.config);
		args.push("--app=" + url);
		if (geometry) args.push("--window-size=" + geometry);
		if (this.config.disableExtensions) args.push("--disable-extensions");
		if (this.config.minimize) args.push("--start-minimized");
		return args;
	}
};
//#endregion
export { Config, DesktopBrowser, DesktopBrowser as default };

//# sourceMappingURL=index.mjs.map