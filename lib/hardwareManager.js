// SPDX-FileCopyrightText: 2026 Przemek
// SPDX-License-Identifier: GPL-2.0-or-later

// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {INITIAL_WAKE_DELAY_MS, RESTORE_RETRY_DELAYS_MS} from './constants.js';
import {KeyboardColorSection} from './keyboardColorSection.js';

/**
 * Manages injection, sleep/resume persistence, and lifecycle within GNOME QuickSettings.
 */
export class KeyboardColorManager {
    constructor(extension) {
        this._extension = extension;
        this._retryCount = 0;
        this._toggle = null;
        this._section = null;
        this._menuSignalId = null;
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
                        this._section?.syncState();
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

    _isKeyboardToggle(child) {
        if (!child)
            return false;

        // 1. Explicit class constructor matching (GNOME Shell default)
        if (child.constructor.name === 'KeyboardBrightnessToggle')
            return true;

        // 2. Slider item presence combined with keyboard icon
        if (child._sliderItem !== undefined) {
            const iconName = child.iconName || child._icon?.icon_name || '';
            const giconStr = child.gicon?.to_string?.() || '';
            if (iconName.includes('keyboard') || giconStr.includes('keyboard'))
                return true;
        }

        // 3. Title fallback (English default or localized gettext matching)
        let localizedKeyboard = '';
        try {
            localizedKeyboard = _('Keyboard');
        } catch (e) {}

        if (child.title === 'Keyboard' || (localizedKeyboard && child.title === localizedKeyboard))
            return true;

        // 4. Any slider item fallback if only one slider exists in quicksettings
        return child._sliderItem !== undefined;
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
                if (this._isKeyboardToggle(child))
                    return child;
            }
        }

        if (qs._indicators) {
            for (const ind of qs._indicators) {
                if (ind.quickSettingsItems) {
                    for (const item of ind.quickSettingsItems) {
                        if (this._isKeyboardToggle(item))
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

        if (this._toggle.menu.connect) {
            this._menuSignalId = this._toggle.menu.connect('open-state-changed', (menu, isOpen) => {
                if (isOpen && this._section)
                    this._section.syncState();
            });
        }
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

        if (this._menuSignalId && this._toggle?.menu) {
            this._toggle.menu.disconnect(this._menuSignalId);
            this._menuSignalId = null;
        }

        if (this._section) {
            this._section.destroy();
            this._section = null;
        }

        this._toggle = null;
    }
}
