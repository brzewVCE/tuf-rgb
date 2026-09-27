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
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
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

const RESTORE_RETRY_DELAYS_MS = [500, 1500, 3000];
const INITIAL_WAKE_DELAY_MS = 500;

/**
 * Custom PopupBaseMenuItem displaying a compact horizontal row of color swatches.
 */
class ColorPaletteItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(onColorSelected, extensionPath) {
        super({
            reactive: false,
            can_focus: false,
            style_class: 'tuf-rgb-palette-item',
        });

        this._onColorSelected = onColorSelected;

        if (this._ornamentIcon) {
            this.remove_child(this._ornamentIcon);
            this._ornamentIcon.destroy();
            this._ornamentIcon = null;
        }

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

        const autoBtn = new St.Button({
            style_class: 'tuf-rgb-swatch tuf-rgb-auto-swatch',
            can_focus: true,
            track_hover: true,
            accessible_name: _('ASUS Aura (Auto)'),
            style: `background-image: url('${extensionPath}/icons/aura-auto.svg'); background-color: transparent;`,
        });
        autoBtn.connect('clicked', () => this._onColorSelected('auto'));
        box.add_child(autoBtn);

        this.add_child(box);
    }
}

/**
 * Controller and UI section managing ASUS TUF RGB backlight.
 */
class KeyboardColorSection extends PopupMenu.PopupMenuSection {
    constructor(extension) {
        super();
        this._extension = extension;
        this._path = extension.path;
        this._notifCooldown = false;
        this._notifTimeoutId = null;

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Color')));
        this.addMenuItem(new ColorPaletteItem(cmd => this._runCmd(cmd), this._path));

        this.addAction(_('RGB Settings'), () => {
            Main.panel.closeQuickSettings();
            this._openPreferences();
        });
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
                        this._notifyPermissionRequired();
                    }
                } catch (e) {
                    // Silently ignore
                }
            });
        } catch (e) {
            console.error(`[tuf-rgb] Command execution failed: ${e.message}`);
        }
    }

    _notifyPermissionRequired() {
        if (this._notifCooldown)
            return;

        this._notifCooldown = true;
        if (this._notifTimeoutId) {
            GLib.source_remove(this._notifTimeoutId);
            this._notifTimeoutId = null;
        }

        this._notifTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 4, () => {
            this._notifCooldown = false;
            this._notifTimeoutId = null;
            return GLib.SOURCE_REMOVE;
        });

        const title = _('TUF Keyboard RGB');
        const body = _('Permissions are required to control keyboard backlight.');

        const source = MessageTray.getSystemSource
            ? MessageTray.getSystemSource()
            : new MessageTray.Source({
                title,
                iconName: 'input-keyboard-symbolic',
            });

        if (Main.messageTray && !source.is_added) {
            try {
                Main.messageTray.add(source);
            } catch (e) {}
        }

        let notification;
        try {
            notification = new MessageTray.Notification({
                source,
                title,
                body,
                isTransient: true,
            });
        } catch {
            notification = new MessageTray.Notification(source, title, body);
            notification.setTransient?.(true);
        }

        notification.addAction(_('Settings'), () => {
            this._openPreferences();
        });

        if (typeof source.showNotification === 'function')
            source.showNotification(notification);
        else
            source.addNotification(notification);
    }

    _openPreferences() {
        try {
            if (typeof this._extension.openPreferences === 'function') {
                this._extension.openPreferences();
                return;
            }
        } catch (e) {}

        try {
            Gio.DBus.session.call(
                'org.gnome.Shell.Extensions',
                '/org/gnome/Shell/Extensions',
                'org.gnome.Shell.Extensions',
                'OpenExtensionPrefs',
                new GLib.Variant('(ssa{sv})', [this._extension.uuid, '', {}]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
        } catch (e) {
            console.error(`[tuf-rgb] Failed to open preferences: ${e.message}`);
        }
    }

    destroy() {
        if (this._notifTimeoutId) {
            GLib.source_remove(this._notifTimeoutId);
            this._notifTimeoutId = null;
        }
        super.destroy();
    }
}

/**
 * Manages injection, sleep/resume persistence, and lifecycle within GNOME QuickSettings.
 */
class KeyboardColorManager {
    constructor(extension) {
        this._extension = extension;
        this._retryCount = 0;
        this._toggle = null;
        this._section = null;
        this._injectTimeoutId = null;
        this._sleepTimeoutId = null;
        this._restoreTimeoutId = null;
        this._sleepSignalId = null;

        this._findAndInject();
        this._restoreColor(0);
        this._setupSleepListener();
    }

    _restoreColor(attempt = 0) {
        if (this._restoreTimeoutId) {
            GLib.source_remove(this._restoreTimeoutId);
            this._restoreTimeoutId = null;
        }

        const bin = `${this._extension.path}/bin/tuf-rgb`;
        try {
            const proc = Gio.Subprocess.new(
                [bin, 'restore'],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.wait_async(null, (p, res) => {
                try {
                    p.wait_finish(res);
                    const exitCode = p.get_exit_status();
                    if (exitCode === 0) {
                        return;
                    }
                    console.warn(`[tuf-rgb] Restore attempt ${attempt + 1} exited with status ${exitCode}`);
                } catch (e) {
                    console.warn(`[tuf-rgb] Restore attempt ${attempt + 1} process error: ${e.message}`);
                }

                if (attempt < RESTORE_RETRY_DELAYS_MS.length) {
                    const delay = RESTORE_RETRY_DELAYS_MS[attempt];
                    this._restoreTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                        this._restoreTimeoutId = null;
                        this._restoreColor(attempt + 1);
                        return GLib.SOURCE_REMOVE;
                    });
                } else {
                    console.error('[tuf-rgb] Color restore failed after all retry attempts');
                }
            });
        } catch (e) {
            console.error(`[tuf-rgb] Failed to spawn restore process: ${e.message}`);
        }
    }

    _setupSleepListener() {
        try {
            this._sleepSignalId = Gio.DBus.system.signal_subscribe(
                'org.freedesktop.login1',
                'org.freedesktop.login1.Manager',
                'PrepareForSleep',
                '/org/freedesktop/login1',
                null,
                Gio.DBusSignalFlags.NONE,
                (conn, sender, path, iface, signal, params) => {
                    const goingToSleep = params.get_child_value(0).get_boolean();
                    if (goingToSleep) {
                        if (this._sleepTimeoutId) {
                            GLib.source_remove(this._sleepTimeoutId);
                            this._sleepTimeoutId = null;
                        }
                        if (this._restoreTimeoutId) {
                            GLib.source_remove(this._restoreTimeoutId);
                            this._restoreTimeoutId = null;
                        }
                    } else {
                        if (this._sleepTimeoutId) {
                            GLib.source_remove(this._sleepTimeoutId);
                            this._sleepTimeoutId = null;
                        }
                        if (this._restoreTimeoutId) {
                            GLib.source_remove(this._restoreTimeoutId);
                            this._restoreTimeoutId = null;
                        }

                        this._sleepTimeoutId = GLib.timeout_add(
                            GLib.PRIORITY_DEFAULT,
                            INITIAL_WAKE_DELAY_MS,
                            () => {
                                this._sleepTimeoutId = null;
                                this._restoreColor(0);
                                return GLib.SOURCE_REMOVE;
                            }
                        );
                    }
                }
            );
        } catch (e) {
            console.error(`[tuf-rgb] Failed to subscribe to sleep signal: ${e.message}`);
        }
    }

    _findAndInject() {
        const toggle = this._findKeyboardToggle();
        if (toggle?.menu) {
            this._inject(toggle);
        } else if (this._retryCount < 10) {
            this._retryCount++;
            this._injectTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this._injectTimeoutId = null;
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
        this._section = new KeyboardColorSection(this._extension);
        this._toggle.menu.addMenuItem(this._section);
    }

    destroy() {
        if (this._injectTimeoutId) {
            GLib.source_remove(this._injectTimeoutId);
            this._injectTimeoutId = null;
        }

        if (this._sleepTimeoutId) {
            GLib.source_remove(this._sleepTimeoutId);
            this._sleepTimeoutId = null;
        }

        if (this._restoreTimeoutId) {
            GLib.source_remove(this._restoreTimeoutId);
            this._restoreTimeoutId = null;
        }

        if (this._sleepSignalId) {
            Gio.DBus.system.signal_unsubscribe(this._sleepSignalId);
            this._sleepSignalId = null;
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
        this._manager = new KeyboardColorManager(this);
    }

    disable() {
        this._manager?.destroy();
        delete this._manager;
    }
}
