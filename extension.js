// SPDX-FileCopyrightText: 2026 Przemek
// SPDX-License-Identifier: GPL-2.0-or-later

// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const PALETTE = [
    {name: 'Red', hex: '#ff0000', cmd: 'red'},
    {name: 'Orange', hex: '#ff6600', cmd: 'orange'},
    {name: 'Yellow', hex: '#ffcc00', cmd: 'yellow'},
    {name: 'Green', hex: '#00e600', cmd: 'green'},
    {name: 'Cyan', hex: '#00d5ff', cmd: 'cyan'},
    {name: 'Blue', hex: '#0055ff', cmd: 'blue'},
    {name: 'Purple', hex: '#9900ff', cmd: 'purple'},
    {name: 'White', hex: '#ffffff', cmd: 'white'},
];

/**
 * Custom PopupBaseMenuItem displaying a compact horizontal row of color swatches.
 */
class ColorPaletteItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(onColorSelected) {
        super({
            reactive: false,
            can_focus: false,
            style_class: 'tuf-rgb-palette-item',
        });

        this._onColorSelected = onColorSelected;

        const box = new St.BoxLayout({
            style_class: 'tuf-rgb-swatch-box',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        for (const c of PALETTE) {
            const btn = new St.Button({
                style_class: 'tuf-rgb-swatch',
                can_focus: true,
                track_hover: true,
                accessible_name: c.name,
                style: `background-color: ${c.hex};`,
            });
            btn.connect('clicked', () => this._onColorSelected(c.cmd));
            box.add_child(btn);
        }

        this.add_child(box);
    }
}

/**
 * Controller and UI section managing ASUS TUF RGB backlight.
 */
class KeyboardColorSection extends PopupMenu.PopupMenuSection {
    constructor(extensionPath) {
        super();
        this._path = extensionPath;
        this._fixItem = null;

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Color')));
        this.addMenuItem(new ColorPaletteItem(cmd => this._runCmd(cmd)));

        this.addAction(_('Next Color'), () => this._runCmd('next'));
        this.addAction(_('ASUS Aura (Auto)'), () => this._runCmd('auto'));

        this._checkPermission();
    }

    _runCmd(cmd) {
        const bin = `${this._path}/bin/tuf-rgb`;
        try {
            const proc = Gio.Subprocess.new(
                [bin, cmd],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.wait_async(null, (p, res) => {
                try {
                    p.wait_finish(res);
                    const exitCode = p.get_exit_status();
                    if (exitCode === 2) {
                        this._promptPolkit(cmd);
                    }
                } catch (e) {
                    // Silently ignore
                }
            });
        } catch (e) {
            console.error(`[tuf-rgb] Command execution failed: ${e.message}`);
        }
    }

    _promptPolkit(pendingCmd = null) {
        const pkCmd = `pkexec sh -c "echo 'SUBSYSTEM==\\"hidraw\\", KERNELS==\\"i2c-ITE5570*\\", TAG+=\\"uaccess\\", MODE=\\"0666\\"' > /etc/udev/rules.d/99-tuf-rgb.rules && udevadm trigger"`;
        try {
            const proc = Gio.Subprocess.new(
                ['sh', '-c', pkCmd],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.wait_async(null, (p, res) => {
                try {
                    p.wait_finish(res);
                    if (p.get_successful()) {
                        if (this._fixItem) {
                            this._fixItem.destroy();
                            this._fixItem = null;
                        }
                        if (pendingCmd) {
                            this._runCmd(pendingCmd);
                        }
                    }
                } catch (e) {}
            });
        } catch (e) {
            console.error(`[tuf-rgb] Polkit error: ${e.message}`);
        }
    }

    _checkPermission() {
        const bin = `${this._path}/bin/tuf-rgb`;
        try {
            const proc = Gio.Subprocess.new(
                [bin, 'check'],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.wait_async(null, (p, res) => {
                try {
                    p.wait_finish(res);
                    if (p.get_exit_status() === 2) {
                        this._fixItem = this.addAction(_('Configure Permissions (Polkit)'), () => {
                            this._promptPolkit();
                        });
                    }
                } catch (e) {}
            });
        } catch (e) {}
    }
}

/**
 * Manages injection and lifecycle within GNOME QuickSettings.
 */
class KeyboardColorManager {
    constructor(extensionPath) {
        this._path = extensionPath;
        this._retryCount = 0;
        this._toggle = null;
        this._section = null;
        this._retryTimeoutId = null;

        this._findAndInject();
    }

    _findAndInject() {
        const toggle = this._findKeyboardToggle();
        if (toggle?.menu) {
            this._inject(toggle);
        } else if (this._retryCount < 10) {
            this._retryCount++;
            this._retryTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this._retryTimeoutId = null;
                this._findAndInject();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _findKeyboardToggle() {
        const qs = Main.panel?.statusArea?.quickSettings;
        if (!qs)
            return null;

        if (qs.menu?._grid) {
            for (const child of qs.menu._grid.get_children()) {
                if (child.constructor.name === 'KeyboardBrightnessToggle' ||
                    child.title === 'Keyboard' ||
                    child.title === 'Klawiatura' ||
                    child._sliderItem !== undefined)
                    return child;
            }
        }

        if (qs._indicators) {
            for (const ind of qs._indicators) {
                if (ind.quickSettingsItems) {
                    for (const item of ind.quickSettingsItems) {
                        if (item.constructor.name === 'KeyboardBrightnessToggle' ||
                            item.title === 'Keyboard' ||
                            item.title === 'Klawiatura' ||
                            item._sliderItem !== undefined)
                            return item;
                    }
                }
            }
        }
        return null;
    }

    _inject(toggle) {
        this._toggle = toggle;
        this._section = new KeyboardColorSection(this._path);
        this._toggle.menu.addMenuItem(this._section);
    }

    destroy() {
        if (this._retryTimeoutId) {
            GLib.source_remove(this._retryTimeoutId);
            this._retryTimeoutId = null;
        }

        if (this._section) {
            this._section.destroy();
            this._section = null;
        }

        this._toggle = null;
    }
}

export default class TufRgbExtension extends Extension {
    enable() {
        this._manager = new KeyboardColorManager(this.path);
    }

    disable() {
        this._manager?.destroy();
        delete this._manager;
    }
}
