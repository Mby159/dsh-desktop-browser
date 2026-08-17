import { Context, Service } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
//#region src/index.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    desktopBrowser: DesktopBrowser;
    webServer: {
      host?: string;
      port?: number;
    };
  }
}
interface Config {
  url?: string;
  browser?: string;
  width?: number;
  height?: number;
  positionX?: number | 'auto';
  positionY?: number | 'auto';
  disableExtensions?: boolean;
  openDelayMs?: number;
  minimize?: boolean;
}
declare const Config: z<Config>;
declare class DesktopBrowser extends Service {
  static Config: z<Config>;
  static inject: readonly ['webServer'];
  private readonly config;
  private browserProcess;
  private openTimer;
  private resolvedUrl;
  constructor(ctx: Context, config: Config);
  get url(): string | undefined;
  get running(): boolean;
  open(): void;
  /** Find a Chromium-based browser installed on the system, or undefined. */
  private findChromiumBrowser;
  close(): void;
  [Service.init](): Promise<void>;
  private detectBrowsers;
  private buildArgs;
}
//#endregion
export { Config, DesktopBrowser, DesktopBrowser as default };
//# sourceMappingURL=index.d.mts.map