# Quick Sound Switcher — GNOME Shell Extension

## Project Overview
GNOME Shell extension that adds audio device selection to the Quick Settings panel. Targets GNOME 45-50 using ESM modules and the QuickSettings API.

- **UUID:** `quick-sound-switcher@dustin-hawkins`
- **Schema:** `org.gnome.shell.extensions.quick-sound-switcher`
- **Gettext domain:** `quick-sound-switcher`
- **Repo:** https://github.com/dustin-hawkins/quick-sound-switcher
- **Based on:** [kgshank/gse-sound-output-device-chooser](https://github.com/kgshank/gse-sound-output-device-chooser) (full rewrite, no shared code)

## File Structure

| File | Purpose |
|------|---------|
| `extension.js` | Extension class — enable/disable, keybindings, registers 3 QuickSettings indicators |
| `deviceChooserBase.js` | Core Gvc.MixerControl logic — device map, filtering, cycling, profiles |
| `outputDeviceChooser.js` | SystemIndicator + QuickMenuToggle for output devices |
| `inputDeviceChooser.js` | SystemIndicator + QuickMenuToggle for input devices |
| `appMixer.js` | SystemIndicator + QuickMenuToggle for per-app volume sliders |
| `portSettings.js` | Settings key constants, card/port scanning (pactl + Python), profile lookup |
| `signalManager.js` | Signal connection tracking and cleanup utility |
| `prefs.js` | ExtensionPreferences with Adw widgets (General, Port Visibility, Shortcuts pages) |
| `utils/pa_helper.py` | Python PulseAudio introspection (optional, for better profile detection) |
| `utils/libpulse_introspect.py` | ctypes bindings to libpulse used by pa_helper.py |

## Build & Install

```bash
# Compile schema (required after any schema XML changes)
glib-compile-schemas schemas/

# Restart GNOME Shell to pick up changes:
#   Wayland: log out / log in
#   X11: Alt+F2 → r

# Enable
gnome-extensions enable quick-sound-switcher@dustin-hawkins

# Open preferences
gnome-extensions prefs quick-sound-switcher@dustin-hawkins

# Build distributable zip
gnome-extensions pack \
  --extra-source=deviceChooserBase.js \
  --extra-source=outputDeviceChooser.js \
  --extra-source=inputDeviceChooser.js \
  --extra-source=appMixer.js \
  --extra-source=portSettings.js \
  --extra-source=signalManager.js \
  --extra-source=utils/ \
  --extra-source=icons/ \
  --podir=locale \
  --out-dir=.
```

## Debugging

```bash
# Watch extension logs in real time
journalctl -f -o cat /usr/bin/gnome-shell

# Enable debug logging (writes to journal with "SDC:" prefix)
gsettings set org.gnome.shell.extensions.quick-sound-switcher enable-log true

# Check if extension is recognized
gnome-extensions list | grep quick-sound

# Check extension status / errors
gnome-extensions show quick-sound-switcher@dustin-hawkins

# View prefs errors
gnome-extensions prefs quick-sound-switcher@dustin-hawkins 2>&1

# Reset all settings to defaults
dconf reset -f /org/gnome/shell/extensions/quick-sound-switcher/
```

## Architecture Notes

- **No GObject classes in deviceChooserBase.js** — it's a plain JS class that uses callbacks (`onDevicesChanged`, `onActiveChanged`) instead of GObject signals. This avoids GObject registration complexity.
- **Device scanning** uses `control.get_streams()` + `control.lookup_device_from_stream()` to enumerate existing devices at startup. The `output-added`/`input-added` signals handle runtime changes.
- **Card index keys** are strings (from regex parsing of pactl output). Always use `String(stream.card_index)` when looking up cards.
- **Profile items** — the active profile is `reactive: false` (display only), inactive profiles are clickable to switch.
- **Signal cleanup** — all three indicators store `open-state-changed` signal IDs and disconnect in `destroy()`. The `SignalManager` handles bulk disconnection for settings and mixer control signals.
- **Locale files** still use the old `sound-output-device-chooser` domain name from the original project. They need renaming to `quick-sound-switcher` for translations to load.

## Pending Work

- [ ] Log out/in to restart GNOME Shell, then run `gnome-extensions enable quick-sound-switcher@dustin-hawkins`
- [ ] Test extension loads without errors (`journalctl -f -o cat /usr/bin/gnome-shell`)
- [ ] Test output device switching
- [ ] Test input device switching
- [ ] Test app mixer (play audio in an app, check slider appears)
- [ ] Test keyboard shortcuts (Super+Alt+PageUp/Down/Home/End)
- [ ] Test preferences window (`gnome-extensions prefs quick-sound-switcher@dustin-hawkins`)
- [ ] Rename locale .po files from `sound-output-device-chooser` to `quick-sound-switcher`
