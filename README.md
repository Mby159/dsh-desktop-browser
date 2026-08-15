# @deepseek-ai/dsh-desktop-browser

A Cordis plugin for DeepSeek Harness that opens the Web UI in a browser window
with no address bar (`--app` mode), giving dsh a native-app feel.

## Features

- **Auto browser detection** — finds Chrome, Edge, Chromium, or Safari on Windows/macOS/Linux
- **Address bar hidden** — uses Chromium's `--app=<url>` flag for a clean window
- **Auto URL resolution** — reads the webserver's host/port from `ctx.webServer`
- **Window geometry** — configurable size and position (auto-center supported)
- **Automatic cleanup** — closes browser on shutdown via `ctx.effect()`

## Usage

### In a `cordis.patch.yml` overlay

```yaml
- insert:
    - id: desktop-browser
      name: '@deepseek-ai/dsh-desktop-browser'
      inject: [webServer]
      config:
        width: 1400
        height: 900
        positionX: auto
        positionY: auto
        disableExtensions: true
        openDelayMs: 500
        minimize: false
```

### Apply to your dsh profile

```bash
# Via command-line --patch
dsh --profile web --patch ./packages/desktop-browser/cordis.patch.yml

# Or add it to your ~/.dsh/cordis.patch.yml
```

## Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | string | auto | Override the URL to open |
| `browser` | string | auto-detect | Explicit browser path |
| `width` | number | 1400 | Window width in pixels |
| `height` | number | 900 | Window height in pixels |
| `positionX` | number \| 'auto' | 'auto' | Window X position |
| `positionY` | number \| 'auto' | 'auto' | Window Y position |
| `disableExtensions` | boolean | true | Pass `--disable-extensions` |
| `openDelayMs` | number | 500 | Delay before opening after server start |
| `minimize` | boolean | false | Start browser minimized |

## API

The plugin registers `ctx.desktopBrowser` with:

- `url` — the resolved URL
- `running` — whether the browser is open
- `open()` — open the browser window
- `close()` — close the browser window

## Requirements

- A Chromium-based browser (Chrome, Edge, Chromium) or Safari (fallback)
- DeepSeek Harness `web` profile running (provides `webServer` service)