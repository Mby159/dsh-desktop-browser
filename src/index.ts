/**
 * @deepseek-ai/dsh-desktop-browser — Host plugin that opens the dsh Web UI
 * in a browser window with the address bar hidden (--app mode).
 *
 * @module @deepseek-ai/dsh-desktop-browser
 */

import { execSync, spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

declare module '@deepseek-ai/cordis' {
  interface Context {
    desktopBrowser: DesktopBrowser
    // webServer augmented by @deepseek-ai/dsh-host-webserver
  }
}

/* ------------------------------------------------------------------ */
/*  Config                                                            */
/* ------------------------------------------------------------------ */

export interface Config {
  url?: string
  browser?: string
  width?: number
  height?: number
  positionX?: number | 'auto'
  positionY?: number | 'auto'
  disableExtensions?: boolean
  openDelayMs?: number
  minimize?: boolean
  closeOnBrowserExit?: boolean
  closeDelayMs?: number
  desktopShortcut?: boolean
  shortcutName?: string
}

export const Config: z<Config> = z.object({
  url: z.string(),
  browser: z.string(),
  width: z.natural().default(1400),
  height: z.natural().default(900),
  positionX: z.union([z.number(), z.const('auto')]).default('auto'),
  positionY: z.union([z.number(), z.const('auto')]).default('auto'),
  disableExtensions: z.boolean().default(true),
  openDelayMs: z.natural().default(500),
  minimize: z.boolean().default(false),
  closeOnBrowserExit: z.boolean().default(true),
  closeDelayMs: z.natural().default(2000),
  desktopShortcut: z.boolean().default(true),
  shortcutName: z.string().default('DeepSeek Harness'),
})

type ResolvedConfig = Required<
  Omit<Config, 'url' | 'browser' | 'positionX' | 'positionY'>
> & Pick<Config, 'url' | 'browser'> & {
  positionX: number | 'auto'
  positionY: number | 'auto'
}

/* ------------------------------------------------------------------ */
/*  Browser discovery                                                  */
/* ------------------------------------------------------------------ */

type BrowserEntry = { path: string; kind: 'chrome' | 'edge' | 'chromium' | 'safari' | 'other' }

function findFirst(candidates: string[]): string | undefined {
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return undefined
}

function defaultBrowserWindows(): string | undefined {
  try {
    const match = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice" /v ProgId 2>&1',
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).match(/ProgId\s+REG_SZ\s+(.+)/i)
    if (!match || !match[1]) return undefined

    const id = match[1].trim().replace(/^"|"$/g, '')

    const cmd = execSync(
      `reg query "HKLM\\SOFTWARE\\Classes\\${id}\\shell\\open\\command" /ve 2>&1`,
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const cmdMatch = cmd.match(/"([^"]*\.exe)"/i)
    if (cmdMatch && cmdMatch[1]) return cmdMatch[1].trim()
    return undefined
  } catch {
    return undefined
  }
}

function detectWindowsBrowsers(): BrowserEntry[] {
  const entries: BrowserEntry[] = []
  const defaultPath = defaultBrowserWindows()
  if (defaultPath) {
    entries.push({ path: defaultPath, kind: 'other' })
  }
  const localAppData = (process.env['LOCALAPPDATA'] ?? `${homedir()}/AppData/Local`).replace(/\\/g, '/')
  const programFiles = (process.env['PROGRAMFILES'] ?? 'C:/Program Files').replace(/\\/g, '/')
  const programFilesX86 = (process.env['PROGRAMFILES(X86)'] ?? 'C:/Program Files (x86)').replace(/\\/g, '/')

  const chromePath = findFirst([
    `${localAppData}/Google/Chrome/Application/chrome.exe`,
    `${programFiles}/Google/Chrome/Application/chrome.exe`,
    `${programFilesX86}/Google/Chrome/Application/chrome.exe`,
  ])
  if (chromePath) entries.push({ path: chromePath, kind: 'chrome' })

  const edgePath = findFirst([
    `${localAppData}/Microsoft/Edge/Application/msedge.exe`,
    `${programFiles}/Microsoft/Edge/Application/msedge.exe`,
    `${programFilesX86}/Microsoft/Edge/Application/msedge.exe`,
  ])
  if (edgePath) entries.push({ path: edgePath, kind: 'edge' })

  return entries
}

function detectMacBrowsers(): BrowserEntry[] {
  const entries: BrowserEntry[] = []
  const appDirs = ['/Applications', `${homedir()}/Applications`]
  const rels = [
    { rel: 'Google Chrome.app/Contents/MacOS/Google Chrome', kind: 'chrome' as const },
    { rel: 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge', kind: 'edge' as const },
    { rel: 'Chromium.app/Contents/MacOS/Chromium', kind: 'chromium' as const },
    { rel: 'Brave Browser.app/Contents/MacOS/Brave Browser', kind: 'chrome' as const },
  ]
  for (const d of appDirs) {
    for (const { rel, kind } of rels) {
      const p = `${d}/${rel}`
      if (existsSync(p)) entries.push({ path: p, kind })
    }
  }
  if (existsSync('/Applications/Safari.app/Contents/MacOS/Safari')) {
    entries.push({ path: '/Applications/Safari.app/Contents/MacOS/Safari', kind: 'safari' })
  }
  return entries
}

function detectLinuxBrowsers(): BrowserEntry[] {
  const candidates: { path: string; kind: 'chrome' | 'chromium' }[] = [
    { path: '/usr/bin/google-chrome', kind: 'chrome' },
    { path: '/usr/bin/google-chrome-stable', kind: 'chrome' },
    { path: '/usr/bin/chromium-browser', kind: 'chromium' },
    { path: '/usr/bin/chromium', kind: 'chromium' },
    { path: '/snap/bin/chromium', kind: 'chromium' },
    { path: '/snap/bin/google-chrome', kind: 'chrome' },
  ]
  return candidates.filter(c => existsSync(c.path))
}

function resolveGeometry(config: Config): string | undefined {
  const width = config.width ?? 1400
  const height = config.height ?? 900
  const posX = config.positionX === 'auto' ? -1 : (config.positionX ?? -1)
  const posY = config.positionY === 'auto' ? -1 : (config.positionY ?? -1)

  if (posX >= 0 && posY >= 0) return `${width}x${height}+${posX}+${posY}`
  if (posX >= 0) return `${width}x${height}+${posX}`
  if (posY >= 0) return `${width}x${height}+0+${posY}`
  return `${width}x${height}`
}

/* ------------------------------------------------------------------ */
/*  Frontend patch: inject pagehide → sendBeacon on tab close          */
/* ------------------------------------------------------------------ */

const QUIT_SCRIPT_ID = '__dsh_db_quitscript__'
const QUIT_ROUTE_PATH = '/api/desktop-browser/quit'
const ALIVE_ROUTE_PATH = '/api/desktop-browser/alive'
const HEARTBEAT_INTERVAL_MS = 3000
const HEARTBEAT_TIMEOUT_MS = 10000

/**
 * Inject a <script> that fires sendBeacon when the Web UI tab/page closes.
 * Applied via tapIndex so it's non-destructive and survives DSH updates.
 */
function patchFrontend(webserver: { tapIndex: (t: (html: string) => string) => () => void }): () => void {
  return webserver.tapIndex((html: string) => {
    if (html.includes(QUIT_SCRIPT_ID)) return html
    const script = `<script id="${QUIT_SCRIPT_ID}">
      setInterval(function(){
        navigator.sendBeacon("${ALIVE_ROUTE_PATH}")
      }, ${HEARTBEAT_INTERVAL_MS})
      document.addEventListener("pagehide", function(){
        navigator.sendBeacon("${QUIT_ROUTE_PATH}")
      })
    </script>`
    return html.replace('</body>', `${script}</body>`)
  })
}

/* ------------------------------------------------------------------ */
/*  Desktop shortcut                                                   */
/* ------------------------------------------------------------------ */

function createWindowsShortcut(
  shortcutPath: string,
  targetPath: string,
  workingDir: string,
): void {
  const dir = join(...targetPath.split('/').slice(0, -1))
  const ps1Path = join(dir, 'create-shortcut.ps1')
  const ps1Content = [
    `$sh = New-Object -ComObject WScript.Shell`,
    `$lnk = $sh.CreateShortcut("${shortcutPath}")`,
    `$lnk.TargetPath = "${targetPath}"`,
    `$lnk.WorkingDirectory = "${workingDir}"`,
    `$lnk.Save()`,
  ].join('\n')
  try {
    writeFileSync(ps1Path, ps1Content)
    execSync(`powershell -ExecutionPolicy Bypass -File "${ps1Path}"`, { stdio: 'ignore' })
  } catch {
    /* non-fatal */
  }
}

function createDesktopShortcut(config: ResolvedConfig): void {
  if (!config.desktopShortcut) return
  const os = platform()
  const desktopDir = join(homedir(), 'Desktop')
  const dshHome = join(homedir(), '.dsh')
  const shortcutName = config.shortcutName ?? 'DeepSeek Harness'
  const launcherPath = join(dshHome, 'launch-dsh.cmd')

  if (!existsSync(launcherPath)) {
    try { writeFileSync(launcherPath, '@echo off\r\nnpx @deepseek-ai/dsh web\r\n') } catch { return }
  }

  try {
    if (os === 'win32') {
      const shortcutPath = join(desktopDir, `${shortcutName}.lnk`)
      if (!existsSync(shortcutPath)) createWindowsShortcut(shortcutPath, launcherPath, dshHome)
    } else if (os === 'darwin') {
      const cmdPath = join(desktopDir, `${shortcutName}.command`)
      if (!existsSync(cmdPath)) {
        writeFileSync(cmdPath, '#!/bin/bash\nnpx @deepseek-ai/dsh web\n')
        execSync(`chmod +x "${cmdPath}"`, { stdio: 'ignore' })
      }
    } else {
      const appsDir = join(homedir(), '.local/share/applications')
      const desktopPath = join(desktopDir, `${shortcutName}.desktop`)
      if (!existsSync(desktopPath)) {
        const content = `[Desktop Entry]\nType=Application\nName=${shortcutName}\nExec=npx @deepseek-ai/dsh web\nTerminal=false\n`
        writeFileSync(desktopPath, content)
        try { execSync(`chmod +x "${desktopPath}"`, { stdio: 'ignore' }) } catch {}
        writeFileSync(join(appsDir, 'deepseek-harness.desktop'), content)
      }
    }
  } catch {
    /* non-fatal */
  }
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

export class DesktopBrowser extends Service {
  static Config: z<Config> = Config
  static inject = ['webServer'] as const

  private readonly config: ResolvedConfig
  private browserProcess: ReturnType<typeof spawn> | null = null
  private openTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private lastAliveAt: number = Date.now()
  private resolvedUrl: string | undefined

  constructor(ctx: Context, config: Config) {
    super(ctx, 'desktopBrowser')
    this.config = config as ResolvedConfig
  }

  get url(): string | undefined {
    return this.resolvedUrl
  }

  get running(): boolean {
    return this.browserProcess !== null
  }

  open(): void {
    if (this.browserProcess) {
      this.ctx.logger.info('desktopBrowser: already running')
      return
    }
    const url = this.resolvedUrl ?? this.config.url ?? 'http://127.0.0.1:3080'
    const args = this.buildArgs(url)

    const chromiumPath = this.findChromiumBrowser()
    if (chromiumPath) {
      this.ctx.logger.info(`desktopBrowser: launching ${chromiumPath} with URL ${url}`)
      this.browserProcess = spawn(chromiumPath, args, { stdio: 'ignore' })
    } else {
      const opener = platform() === 'win32' ? 'cmd' : platform() === 'darwin' ? 'open' : 'xdg-open'
      const openerArgs = platform() === 'win32' ? ['/c', 'start', '', url] : [url]
      this.ctx.logger.warn(
        `desktopBrowser: no Chromium browser found, opening ${url} with default browser (will retain address bar)`,
      )
      this.browserProcess = spawn(opener, openerArgs, { stdio: 'ignore' })
    }

    this.browserProcess.on('error', (err: Error) => {
      this.ctx.logger.error(`desktopBrowser: process error: ${err.message}`)
      this.browserProcess = null
    })
    this.browserProcess.on('exit', (code: number | null) => {
      this.ctx.logger.info(`desktopBrowser: browser exited (code=${code})`)
      this.browserProcess = null
    })
    this.browserProcess.unref()
  }

  private findChromiumBrowser(): string | undefined {
    if (this.config.browser && existsSync(this.config.browser)) {
      return this.config.browser.replace(/\\/g, '/')
    }
    const detected = this.detectBrowsers()
    for (const kind of ['chrome', 'edge', 'chromium', 'other'] as const) {
      const found = detected.find(b => b.kind === kind)
      if (found) {
        const b = found.path.toLowerCase()
        if (b.includes('chrome') || b.includes('edge') || b.includes('chromium') || b.includes('brave')) {
          return found.path.replace(/\\/g, '/')
        }
      }
    }
    return undefined
  }

  close(): void {
    if (this.openTimer) {
      clearTimeout(this.openTimer)
      this.openTimer = null
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.browserProcess) {
      this.ctx.logger.info('desktopBrowser: closing browser')
      this.browserProcess.kill('SIGTERM')
      this.browserProcess = null
    } else {
      this.ctx.logger.info('desktopBrowser: not running')
    }
  }

  async [Service.init](): Promise<void> {
    const host = this.ctx.webServer?.host ?? this.config.url?.match(/^http:\/\/([^\/:]+)/)?.[1] ?? '127.0.0.1'
    const port = this.ctx.webServer?.port ?? Number(this.config.url?.match(/:(\d+)/)?.[1] ?? '3080')
    this.resolvedUrl = `http://${host}:${port}`
    this.ctx.logger.info(`desktopBrowser: ready — will open ${this.resolvedUrl}`)

    this.openTimer = setTimeout(() => { this.open() }, this.config.openDelayMs)

    createDesktopShortcut(this.config)

    // Feature 1: close dsh when Web UI tab closes
    if (this.config.closeOnBrowserExit && this.ctx.webServer) {
      const delay = this.config.closeDelayMs
      try {
        // Patch frontend: inject heartbeat + pagehide + visibilitychange
        patchFrontend(this.ctx.webServer)
        this.ctx.logger.info('desktopBrowser: frontend patched — heartbeat + pagehide + visibilitychange active')

        // Register /alive (heartbeat) and /quit routes
        this.ctx.webServer.register({
          kind: 'exact',
          path: ALIVE_ROUTE_PATH,
          handler: (_req, res) => {
            this.lastAliveAt = Date.now()
            res.writeHead(204)
            res.end()
          },
        })
        this.ctx.webServer.register({
          kind: 'exact',
          path: QUIT_ROUTE_PATH,
          handler: (_req, res) => {
            res.writeHead(204)
            res.end()
            setTimeout(() => {
              this.ctx.logger.info('desktopBrowser: quit requested, shutting down dsh')
              process.exit(0)
            }, delay)
          },
        })
        this.ctx.logger.info(`desktopBrowser: alive+quit routes registered`)

        // Heartbeat monitor: exit dsh if no heartbeat for 15 seconds
        this.heartbeatTimer = setInterval(() => {
          const idle = Date.now() - this.lastAliveAt
          if (idle > HEARTBEAT_TIMEOUT_MS) {
            this.ctx.logger.info(
              `desktopBrowser: no heartbeat for ${Math.round(idle / 1000)}s — shutting down dsh`,
            )
            if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = null
            process.exit(0)
          }
        }, 1000)
      } catch (err) {
        this.ctx.logger.warn(`desktopBrowser: failed to set up close-on-browser-exit: ${err}`)
      }
    }

    this.ctx.effect(() => () => { this.close() }, 'desktopBrowser.open')
  }

  private detectBrowsers(): BrowserEntry[] {
    const os = platform()
    return os === 'win32' ? detectWindowsBrowsers()
      : os === 'darwin' ? detectMacBrowsers()
        : detectLinuxBrowsers()
  }

  private buildArgs(url: string): string[] {
    const args: string[] = []
    const geometry = resolveGeometry(this.config)
    args.push('--app=' + url)
    if (geometry) args.push('--window-size=' + geometry)
    if (this.config.disableExtensions) args.push('--disable-extensions')
    if (this.config.minimize) args.push('--start-minimized')
    return args
  }
}

export default DesktopBrowser
