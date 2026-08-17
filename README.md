# @deepseek-ai/dsh-desktop-browser

Opens the dsh Web UI in a browser window with **no address bar**, giving it a native-app feel.

## Features

- **Auto browser detection** — finds Chrome, Edge, Chromium, or Safari on Windows/macOS/Linux
- **Address bar hidden** — uses Chromium's `--app=<url>` flag
- **Auto URL resolution** — reads host/port from the webserver
- **Window geometry** — configurable size and position (auto-center supported)
- **Automatic cleanup** — closes browser when dsh shuts down

## Quick Start

```bash
# 1. Install the plugin into your web profile
dsh plugin --profile web add Mby159/dsh-desktop-browser

# 2. Start dsh — browser opens automatically!
dsh web
```

That's it! No extra configuration needed.

## Requirements

- A Chromium-based browser (Chrome, Edge, Chromium) or Safari
- DeepSeek Harness `web` profile

## Configuration (optional)

The plugin works with zero config. To customize, edit your profile's `cordis.patch.yml`:

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

The plugin registers `ctx.desktopBrowser`:

- `url` — the resolved URL
- `running` — whether the browser is open
- `open()` — open the browser window
- `close()` — close the browser window
