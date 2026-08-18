import { execSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
//#region src/index.ts
const Config = z.object({
	url: z.string(),
	browser: z.string(),
	width: z.natural().default(1400),
	height: z.natural().default(900),
	positionX: z.union([z.number(), z.const("auto")]).default("auto"),
	positionY: z.union([z.number(), z.const("auto")]).default("auto"),
	disableExtensions: z.boolean().default(true),
	openDelayMs: z.natural().default(500),
	minimize: z.boolean().default(false),
	closeOnBrowserExit: z.boolean().default(true),
	closeDelayMs: z.natural().default(2000),
	desktopShortcut: z.boolean().default(true),
	shortcutName: z.string().default("DeepSeek Harness")
});

function findFirst(candidates) {
	for (const p of candidates) if (existsSync(p)) return p;
	return undefined;
}

function defaultBrowserWindows() {
	try {
		const match = execSync("reg query \"HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice\" /v ProgId 2>&1", {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"]
		}).match(/ProgId\s+REG_SZ\s+(.+)/i);
		if (!match || !match[1]) return void 0;
		const id = match[1].trim().replace(/^"|"$/g, "");
		const cmd = execSync(`reg query "HKLM\\SOFTWARE\\Classes\\${id}\\shell\\open\\command" /ve 2>&1`, {
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"]
		});
		const cmdMatch = cmd.match(/"([^"]*\.exe)"/i);
		if (cmdMatch && cmdMatch[1]) return cmdMatch[1].trim();
		return;
	} catch {
		return;
	}
}

function detectWindowsBrowsers() {
	const entries = [];
	const defaultPath = defaultBrowserWindows();
	if (defaultPath) entries.push({ path: defaultPath, kind: "other" });
	const localAppData = (process.env["LOCALAPPDATA"] ?? `${homedir()}/AppData/Local`).replace(/\\/g, "/");
	const programFiles = (process.env["PROGRAMFILES"] ?? "C:/Program Files").replace(/\\/g, "/");
	const programFilesX86 = (process.env["PROGRAMFILES(X86)"] ?? "C:/Program Files (x86)").replace(/\\/g, "/");
	const chromePath = findFirst([
		`${localAppData}/Google/Chrome/Application/chrome.exe`,
		`${programFiles}/Google/Chrome/Application/chrome.exe`,
		`${programFilesX86}/Google/Chrome/Application/chrome.exe`
	]);
	if (chromePath) entries.push({ path: chromePath, kind: "chrome" });
	const edgePath = findFirst([
		`${localAppData}/Microsoft/Edge/Application/msedge.exe`,
		`${programFiles}/Microsoft/Edge/Application/msedge.exe`,
		`${programFilesX86}/Microsoft/Edge/Application/msedge.exe`
	]);
	if (edgePath) entries.push({ path: edgePath, kind: "edge" });
	return entries;
}

function detectMacBrowsers() {
	const entries = [];
	const appDirs = ["/Applications", `${homedir()}/Applications`];
	const rels = [
		{ rel: "Google Chrome.app/Contents/MacOS/Google Chrome", kind: "chrome" },
		{ rel: "Microsoft Edge.app/Contents/MacOS/Microsoft Edge", kind: "edge" },
		{ rel: "Chromium.app/Contents/MacOS/Chromium", kind: "chromium" },
		{ rel: "Brave Browser.app/Contents/MacOS/Brave Browser", kind: "chrome" }
	];
	for (const d of appDirs) for (const { rel, kind } of rels) {
		const p = `${d}/${rel}`;
		if (existsSync(p)) entries.push({ path: p, kind })
	}
	if (existsSync("/Applications/Safari.app/Contents/MacOS/Safari")) entries.push({ path: "/Applications/Safari.app/Contents/MacOS/Safari", kind: "safari" });
	return entries;
}

function detectLinuxBrowsers() {
	return [
		{ path: "/usr/bin/google-chrome", kind: "chrome" },
		{ path: "/usr/bin/google-chrome-stable", kind: "chrome" },
		{ path: "/usr/bin/chromium-browser", kind: "chromium" },
		{ path: "/usr/bin/chromium", kind: "chromium" },
		{ path: "/snap/bin/chromium", kind: "chromium" },
		{ path: "/snap/bin/google-chrome", kind: "chrome" }
	].filter((c) => existsSync(c.path))
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

function findFaviconPath() {
	const candidates = [
		join(homedir(), ".dsh/profiles/web/node_modules/@deepseek-ai/dsh-web-frontend/dist/favicon.svg")
	];
	for (const p of candidates) if (existsSync(p)) return p;
	return void 0;
}

function createWindowsShortcut(shortcutPath, targetPath, workingDir, iconPath) {
	const dir = join(...targetPath.split("/").slice(0, -1));
	const ps1Path = join(dir, "create-shortcut.ps1");
	const ps1Content = [
		`$sh = New-Object -ComObject WScript.Shell`,
		`$lnk = $sh.CreateShortcut("${shortcutPath}")`,
		`$lnk.TargetPath = "${targetPath}"`,
		`$lnk.WorkingDirectory = "${workingDir}"`,
		iconPath ? `$lnk.IconLocation = "${iconPath}"` : "",
		`$lnk.Save()`
	].filter(Boolean).join("\n");
	try {
		writeFileSync(ps1Path, ps1Content);
		execSync(`powershell -ExecutionPolicy Bypass -File "${ps1Path}"`, { stdio: "ignore" });
	} catch {
		/* non-fatal */
	}
}

function createDesktopShortcut(config) {
	if (!config.desktopShortcut) return;
	const os = platform();
	const desktopDir = join(homedir(), "Desktop");
	const dshHome = join(homedir(), ".dsh");
	const shortcutName = config.shortcutName ?? "DeepSeek Harness";
	const launcherPath = join(dshHome, "launch-dsh.cmd");
	if (!existsSync(launcherPath)) {
		try {
			writeFileSync(launcherPath, "@echo off\r\nnpx @deepseek-ai/dsh web\r\n");
		} catch {
			return;
		}
	}
	const iconSrc = findFaviconPath();
	let iconPath = "";
	if (iconSrc) {
		iconPath = join(dshHome, "dsh-icon.svg");
		try {
			if (!existsSync(iconPath)) copyFileSync(iconSrc, iconPath);
		} catch {
			iconPath = "";
		}
	}
	try {
		if (os === "win32") {
			const shortcutPath = join(desktopDir, `${shortcutName}.lnk`);
			if (!existsSync(shortcutPath)) createWindowsShortcut(shortcutPath, launcherPath, dshHome, iconPath);
		} else if (os === "darwin") {
			const cmdPath = join(desktopDir, `${shortcutName}.command`);
			if (!existsSync(cmdPath)) {
				writeFileSync(cmdPath, "#!/bin/bash\nnpx @deepseek-ai/dsh web\n");
				execSync(`chmod +x "${cmdPath}"`, { stdio: "ignore" });
			}
		} else {
			const appsDir = join(homedir(), ".local/share/applications");
			const desktopPath = join(desktopDir, `${shortcutName}.desktop`);
			if (!existsSync(desktopPath)) {
				const content = `[Desktop Entry]\nType=Application\nName=${shortcutName}\nExec=npx @deepseek-ai/dsh web\nIcon=${iconPath}\nTerminal=false\n`;
				writeFileSync(desktopPath, content);
				try { execSync(`chmod +x "${desktopPath}"`, { stdio: "ignore" }) } catch {}
				writeFileSync(join(appsDir, "deepseek-harness.desktop"), content);
			}
		}
	} catch {
		/* non-fatal */
	}
}

var DesktopBrowser = class extends Service {
	static Config = Config;
	static inject = ["webServer"];
	config;
	browserProcess = null;
	openTimer = null;
	closeTimer = null;
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
				stdio: "ignore"
			});
		} else {
			const opener = platform() === "win32" ? "cmd" : platform() === "darwin" ? "open" : "xdg-open";
			const openerArgs = platform() === "win32" ? ["/c", "start", "", url] : [url];
			this.ctx.logger.warn(`desktopBrowser: no Chromium browser found, opening ${url} with default browser (will retain address bar)`);
			this.browserProcess = spawn(opener, openerArgs, {
				stdio: "ignore"
			});
		}
		this.browserProcess.on("error", (err) => {
			this.ctx.logger.error(`desktopBrowser: process error: ${err.message}`);
			this.browserProcess = null;
		});
		this.browserProcess.on("exit", (code) => {
			this.ctx.logger.info(`desktopBrowser: browser exited (code=${code})`);
			this.browserProcess = null;
			if (this.config.closeOnBrowserExit) {
				const delay = this.config.closeDelayMs;
				this.ctx.logger.info(`desktopBrowser: browser closed — scheduling shutdown in ${delay}ms`);
				this.closeTimer = setTimeout(() => {
					if (!this.browserProcess) {
						this.ctx.logger.info("desktopBrowser: shutting down dsh process");
						process.exit(0);
					} else {
						this.ctx.logger.info("desktopBrowser: browser reopened, skipping shutdown");
					}
				}, delay);
			}
		});
		this.browserProcess.unref();
	}
	findChromiumBrowser() {
		if (this.config.browser && existsSync(this.config.browser)) return this.config.browser.replace(/\\/g, "/");
		const detected = this.detectBrowsers();
		for (const kind of ["chrome", "edge", "chromium", "other"]) {
			const found = detected.find((b) => b.kind === kind);
			if (found) {
				const b = found.path.toLowerCase();
				if (b.includes("chrome") || b.includes("edge") || b.includes("chromium") || b.includes("brave")) return found.path.replace(/\\/g, "/");
			}
		}
		return void 0;
	}
	close() {
		if (this.openTimer) {
			clearTimeout(this.openTimer);
			this.openTimer = null;
		}
		if (this.closeTimer) {
			clearTimeout(this.closeTimer);
			this.closeTimer = null;
		}
		if (this.browserProcess) {
			this.ctx.logger.info("desktopBrowser: closing browser");
			this.browserProcess.kill("SIGTERM");
			this.browserProcess = null;
		} else {
			this.ctx.logger.info("desktopBrowser: not running");
		}
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
		createDesktopShortcut(this.config);
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

export { Config, DesktopBrowser, DesktopBrowser as default };
//#endregion

//# sourceMappingURL=index.mjs.map
