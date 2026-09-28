# TUF Keyboard RGB for GNOME

[![GNOME 45 | 46 | 47](https://img.shields.io/badge/GNOME-45%20%7C%2046%20%7C%2047-blue.svg)](https://extensions.gnome.org/)
[![License: GPL-2.0](https://img.shields.io/badge/License-GPLv2-green.svg)](LICENSE)

A lightweight GNOME Shell extension that seamlessly integrates RGB keyboard backlight color controls into the native GNOME Quick Settings menu on ASUS TUF Gaming laptops.

Designed specifically for 2024+ ASUS laptops equipped with the **ITE5570 HID LampArray** keyboard controller (such as ASUS TUF Gaming A16 FA607, A18 FA808, and related models).

---

## Features

- **Native Quick Settings Integration:** Adds an elegant, compact color palette and animation controls directly under the existing "Keyboard" brightness menu.
- **Modern GNOME & Libadwaita Design:** Follows GNOME Human Interface Guidelines and system accent colors (`.quick-toggle:checked`, `.button.default`) with rounded swatches, active checkmark indicator, dynamic effect presets, and a dedicated Libadwaita Preferences dialog.
- **8 Pure Color Swatches:** One-click instant switching between 8 vibrant presets (Red, Orange, Yellow, Green, Cyan, Blue, Purple, White) with clean visual active indicator and smart high-contrast checkmark.
- **Dynamic Effect Presets:** Choose between **Static**, **Breathe** (smooth sine wave), **Heartbeat** (double-pulse EKG rhythm), and **Cycle** (smooth rainbow color transition).
- **Speed Slider:** Intuitive native speed control slider active for all dynamic animation modes, visually matching system sliders.
- **State Persistence:** Automatically saves your color, effect mode, and animation speed, seamlessly restoring them across logins, reboots, and sleep/wake suspend cycles (`PrepareForSleep` DBus integration).
- **Non-Intrusive Permission Handling:** Instead of intrusive Polkit popups on every color change, unprivileged attempts generate a standard GNOME notification with a `[Settings]` button to grant persistent access once.
- **Libadwaita Preferences Window:** Configure and manage `/etc/udev/rules.d/99-tuf-rgb.rules` with a single click, view detected device paths (e.g. `/dev/hidraw2`), and inspect permission health.
- **Ultra-Lightweight Background Engine:** Operates with < 0.2% CPU overhead during animations and 0% CPU in static mode.

---

## Supported Hardware

- **ASUS TUF Gaming A16** (FA607 series, e.g. FA607NU, FA607PV)
- **ASUS TUF Gaming A18** (FA808 series)
- ASUS laptops with the **ITE5570** LampArray keyboard controller (`0B05:19B6` on `i2c-ITE5570:00`, Usage Page `0x59`)

---

## Installation

### Method 1: GNOME Extensions Website (Recommended)
Install directly from [extensions.gnome.org](https://extensions.gnome.org/extension/) (Search for **TUF Keyboard RGB**).

### Method 2: Manual Installation from Source

1. Clone the repository into your local extensions directory:
   ```bash
   git clone https://github.com/brzewVCE/tuf-rgb.git ~/.local/share/gnome-shell/extensions/tuf-rgb@brzewvce.github.com
   ```

2. Restart GNOME Shell:
   - On **X11**: Press `Alt + F2`, type `r`, and press `Enter`.
   - On **Wayland**: Log out and log back in.

3. Enable the extension:
   ```bash
   gnome-extensions enable tuf-rgb@brzewvce.github.com
   ```

4. Open the Quick Settings menu, expand the **Keyboard** toggle, and click **RGB Settings** (or click any color swatch and use the `[Settings]` notification button). In the Preferences window, click **Install** to grant persistent hardware access via `udev`.

---

## Keyboard Shortcuts & CLI

The extension includes a standalone command-line helper at `bin/tuf-rgb`. You can map any custom key combination (e.g. `Super + F4` or `Ctrl + Alt + K`) to cycle through colors or toggle backlight:

1. Open **Settings -> Keyboard -> Keyboard Shortcuts -> Custom Shortcuts**.
2. Click **+** and configure:
   - **Name:** `Keyboard Next Color`
   - **Command:** `python3 ~/.local/share/gnome-shell/extensions/tuf-rgb@brzewvce.github.com/bin/tuf-rgb next`
   - **Shortcut:** Your preferred key combination.

Available CLI subcommands:
- `bin/tuf-rgb effect <static|breathe|heartbeat|cycle> [--speed <0.1-1.0>]` - Switch animation effect
- `bin/tuf-rgb speed <0.1-1.0>` - Change animation speed in real time
- `bin/tuf-rgb stop-effect` - Stop running animation daemon
- `bin/tuf-rgb state` - Print current hardware color, effect, and daemon state
- `bin/tuf-rgb prev` / `bin/tuf-rgb next` - Cycle through color presets
- `bin/tuf-rgb toggle` - Turn backlight on/off
- `bin/tuf-rgb restore` - Reapply saved color, effect mode, and speed
- `bin/tuf-rgb #00d5ff` - Set custom hex color

---

## License

This project is licensed under the GNU General Public License v2.0 or later ([GPL-2.0-or-later](LICENSE)).
