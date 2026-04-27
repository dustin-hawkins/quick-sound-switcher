# Quick Sound Switcher

GNOME Shell extension that adds audio device selection to the Quick Settings panel. Switch output/input devices, change audio profiles, and control per-application volume — all from the system menu.

Based on [Sound Input & Output Device Chooser](https://github.com/kgshank/gse-sound-output-device-chooser) by Gopi Sankar Karmegam, rewritten from scratch for GNOME 45-50 using modern ESM modules and the QuickSettings API.

## Features

- **Output Device Chooser** — Quick Settings toggle menu listing all output devices (speakers, HDMI, Bluetooth, etc.)
- **Input Device Chooser** — Quick Settings toggle menu listing all input devices (microphones)
- **Audio Profile Switching** — Change device profiles (e.g., A2DP vs HSP/HFP for Bluetooth headsets)
- **Per-App Volume Mixer** — Control volume per application and route app audio to different outputs
- **Keyboard Shortcuts** — Cycle through devices with configurable hotkeys
- **Port Visibility** — Hide or always-show specific audio ports
- **Configurable Icons** — Monochrome, colored, or no icons

## Requirements

- GNOME Shell 45, 46, 47, 48, 49, or 50
- PulseAudio or PipeWire (with PulseAudio compatibility)
- Python 3 (optional, for improved port profile detection)

## Installation

### From Source

```bash
git clone https://github.com/dustin-hawkins/quick-sound-switcher.git
cd quick-sound-switcher
mkdir -p ~/.local/share/gnome-shell/extensions/quick-sound-switcher@dustin-hawkins
cp -r * ~/.local/share/gnome-shell/extensions/quick-sound-switcher@dustin-hawkins/
glib-compile-schemas ~/.local/share/gnome-shell/extensions/quick-sound-switcher@dustin-hawkins/schemas/
```

Then restart GNOME Shell (log out/in on Wayland, or `Alt+F2` → `r` on X11) and enable:

```bash
gnome-extensions enable quick-sound-switcher@dustin-hawkins
```

### From Zip Bundle

```bash
gnome-extensions install quick-sound-switcher@dustin-hawkins.shell-extension.zip
```

## Configuration

Open preferences via:

```bash
gnome-extensions prefs quick-sound-switcher@dustin-hawkins
```

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Hide on Single Device | Hide chooser when only one device exists | Off |
| Icon Theme | Monochrome, Colored, or None | Monochrome |
| Show Audio Profiles | Display profile options per device | On |
| Show Output/Input Chooser | Enable each device type selector | On |
| Always Show Input Slider | Keep mic slider visible even when idle | On |
| Block Hidden Device Activation | Prevent auto-switching to hidden devices | On |
| Use Python for Profiles | More accurate profile detection via Python | On |

### Keyboard Shortcuts

| Action | Default Shortcut |
|--------|-----------------|
| Cycle Output Forward | `Super+Alt+Page Up` |
| Cycle Output Backward | `Super+Alt+Page Down` |
| Cycle Input Forward | `Super+Alt+Home` |
| Cycle Input Backward | `Super+Alt+End` |

Edit shortcuts via `dconf-editor` at `/org/gnome/shell/extensions/quick-sound-switcher/`.

## Credits

This project is a ground-up rewrite inspired by [Sound Input & Output Device Chooser](https://github.com/kgshank/gse-sound-output-device-chooser):

- Original concept and logic by [Gopi Sankar Karmegam](https://github.com/kgshank)
- Volume mixer based on work by [Brendan Early](https://github.com/mymindstorm/gnome-volume-mixer) and Burak Sener
- Rewritten for GNOME 45-50 by [Dustin Hawkins](https://github.com/dustin-hawkins)

## License

GPL-3.0-or-later. See [license](license) for details.
