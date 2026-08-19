# @deepseek-ai/dsh-desktop-browser

Opens the dsh Web UI in a browser window with **no address bar**, giving it a native-app feel.

## Features

- **Auto browser detection** — finds Chrome, Edge, Chromium, or Safari on Windows/macOS/Linux
- **Address bar hidden** — uses Chromium's `--app=<url>` flag
- **Auto URL resolution** — reads host/port from the webserver
- **Window geometry** — configurable size and position (auto-center supported)
- **Automatic cleanup** — closes browser when dsh shuts down

## Installation

```bash
dsh plugin --profile web add Mby159/dsh-desktop-browser
```

Then start dsh:

```bash
dsh web
```

The plugin's `cordis.patch.yml` is merged automatically — no manual configuration editing required.

## Verifying the installation

After `dsh plugin add` completes, verify the plugin is active before starting `dsh web`:

```bash
dsh --profile web --dump-config | grep desktop-browser
```

If the plugin was successfully added to the bundles list, the output includes `desktop-browser` in the config tree.

If the grep finds nothing, the plugin package was installed but the bundles list was not updated. Fix it manually:

```bash
# Read the profile's package.json
# Add "@deepseek-ai/dsh-desktop-browser" to the dsh.profile.bundles array if it is missing
# Then re-verify:
dsh --profile web --dump-config | grep desktop-browser
```

## When the browser doesn't open

If `dsh web` starts but no browser window appears:

1. Check the dsh startup logs for `[desktopBrowser]`. If you see:
   ```
   [desktop-browser] bundle not found in profile bundles
   ```
   → The plugin is not in the bundles list. Apply the fix above.

2. If the logs show no desktop-browser entries at all, the plugin was not loaded. Verify with:
   ```
   dsh --profile web --dump-config | grep desktop-browser
   ```

## Requirements

- A Chromium-based browser (Chrome, Edge, Chromium) or Safari
- DeepSeek Harness `web` profile
- pnpm ≥10: if installing from GitHub and pnpm reports a blocked `prepare` script, add the key it prints to `~/.dsh/profiles/web/pnpm-workspace.yaml` under `allowBuilds`, then re-run the install command above

## How it works

The plugin is a Cordis bundle. `dsh plugin add` installs the package and adds it to your profile's `dsh.profile.bundles` list, so the plugin's `cordis.patch.yml` is loaded automatically on every `dsh web` startup.

## Configuration (optional)

The plugin works with zero config. To override defaults, create or edit `~/.dsh/profiles/web/cordis.patch.yml` with your overrides:

```yaml
- id: desktop-browser
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
