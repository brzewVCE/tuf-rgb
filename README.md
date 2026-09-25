# TUF Keyboard RGB for GNOME

[![GNOME 45 | 46 | 47](https://img.shields.io/badge/GNOME-45%20%7C%2046%20%7C%2047-blue.svg)](https://extensions.gnome.org/)
[![License: GPL-2.0](https://img.shields.io/badge/License-GPLv2-green.svg)](LICENSE)

A lightweight GNOME Shell extension that seamlessly integrates RGB keyboard backlight color controls into the native GNOME Quick Settings menu on ASUS TUF Gaming laptops.

Designed specifically for 2024+ ASUS laptops equipped with the **ITE5570 HID LampArray** keyboard controller (such as ASUS TUF Gaming A16 FA607, A18 FA808, and related models).

---

## Features

- **Native Quick Settings Integration:** Adds an elegant, compact color palette directly under the existing "Keyboard" brightness menu.
- **Adwaita Design:** Follows GNOME Human Interface Guidelines with rounded square swatches, subtle shadows, and hover effects.
- **One-Click Color Switching:** 8 vibrant presets (Red, Orange, Yellow, Green, Cyan, Blue, Purple, White) plus a "Next Color" action.
- **Factory ASUS Mode:** Toggle back to the autonomous firmware Aura profile at any time.
- **Zero-Terminal Setup (Polkit):** Prompts for administrator authentication via the standard system dialog on first run—no manual `udev` configuration required.
- **Asynchronous & Lightweight:** No background daemons, zero battery drain, and non-blocking I/O via `Gio.Subprocess`.

---

## Supported Hardware

- **ASUS TUF Gaming A16** (FA607 series, e.g. FA607NU, FA607PV)
- **ASUS TUF Gaming A18** (FA808 series)
- ASUS laptops with **ITE5570** keyboard controller (`0B05:19B6` on `i2c-ITE5570:00`)

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

4. Open the Quick Settings menu, expand the **Keyboard** toggle, and click any color. When prompted by the system dialog, enter your password to grant hardware access once.

---

## Optional: Keyboard Shortcut

You can map any custom key combination (e.g. `Super + F4` or `Ctrl + Alt + K`) to cycle through colors:

1. Open **Settings -> Keyboard -> Keyboard Shortcuts -> Custom Shortcuts**.
2. Click **+** and set:
   - **Name:** `Keyboard Next Color`
   - **Command:** `python3 ~/.local/share/gnome-shell/extensions/tuf-rgb@brzewvce.github.com/bin/tuf-rgb next`
   - **Shortcut:** Your preferred key combination.

---

## License

This project is licensed under the GNU General Public License v2.0 or later ([GPL-2.0-or-later](LICENSE)).
