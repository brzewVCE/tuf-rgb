// SPDX-FileCopyrightText: 2026 Przemek
// SPDX-License-Identifier: GPL-2.0-or-later

// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {ColorPaletteItem} from './colorPalette.js';
import {EffectPillsItem, SpeedSliderItem} from './effectSelector.js';

/**
 * Controller and UI section managing ASUS TUF RGB backlight.
 */
export class KeyboardColorSection extends PopupMenu.PopupMenuSection {
    constructor(extension) {
        super();
        this._extension = extension;
        this._path = extension.path;
        this._notifCooldown = false;
        this._notifTimeoutId = null;
        this._currentColor = 'red';
        this._currentEffect = 'static';

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Color')));
        this._paletteItem = new ColorPaletteItem(cmd => this._onColorSelected(cmd));
        this.addMenuItem(this._paletteItem);

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Effect')));
        this._effectsItem = new EffectPillsItem(effectId => this._onEffectSelected(effectId));
        this.addMenuItem(this._effectsItem);

        this._speedItem = new SpeedSliderItem(speed => this._onSpeedChanged(speed), this._path);
        this.addMenuItem(this._speedItem);

        this.addAction(_('RGB Settings'), () => {
            Main.panel.closeQuickSettings();
            this._openPreferences();
        });

        this.syncState();
    }

    syncState() {
        const configHome = GLib.getenv('XDG_CONFIG_HOME') || `${GLib.get_home_dir()}/.config`;
        const stateFile = `${configHome}/tuf-rgb/state.json`;
        const file = Gio.File.new_for_path(stateFile);

        file.load_contents_async(null, (source, res) => {
            try {
                const [ok, contents] = source.load_contents_finish(res);
                if (!ok || !contents)
                    return;

                const state = JSON.parse(new TextDecoder().decode(contents));
                this._applyState(state);
            } catch (e) {
                // Ignore missing file or transient write locks
            }
        });
    }

    _applyState(state) {
        if (!state)
            return;

        this._currentColor = state.color_name || 'red';
        this._currentEffect = state.effect || 'static';
        const speed = state.speed !== undefined ? state.speed : 0.5;

        this._speedItem.setSpeed(speed);
        this._effectsItem.setActiveEffect(this._currentEffect);

        if (this._currentEffect === 'cycle') {
            this._paletteItem.setActiveColor(null, true);
            this._speedItem.setEnabled(true);
        } else if (this._currentEffect === 'static') {
            this._paletteItem.setActiveColor(this._currentColor, false);
            this._speedItem.setEnabled(false);
        } else {
            this._paletteItem.setActiveColor(this._currentColor, false);
            this._speedItem.setEnabled(true);
        }
    }

    _onColorSelected(cmd) {
        if (this._currentEffect === 'cycle') {
            this._currentEffect = 'static';
            this._effectsItem.setActiveEffect('static');
            this._speedItem.setEnabled(false);
        }

        this._currentColor = cmd;
        this._paletteItem.setActiveColor(cmd, false);
        this._runCmd(cmd);
    }

    _onEffectSelected(effectId) {
        this._currentEffect = effectId;

        if (effectId === 'cycle') {
            this._paletteItem.setActiveColor(null, true);
            this._effectsItem.setActiveEffect('cycle');
            this._speedItem.setEnabled(true);
            this._runCmd(['effect', 'cycle']);
        } else if (effectId === 'static') {
            this._paletteItem.setActiveColor(this._currentColor, false);
            this._effectsItem.setActiveEffect('static');
            this._speedItem.setEnabled(false);
            this._runCmd(['effect', 'static']);
        } else {
            this._paletteItem.setActiveColor(this._currentColor, false);
            this._effectsItem.setActiveEffect(effectId);
            this._speedItem.setEnabled(true);
            this._runCmd(['effect', effectId]);
        }
    }

    _onSpeedChanged(speedVal) {
        this._runCmd(['speed', speedVal.toFixed(2)]);
    }

    _runCmd(args) {
        const bin = `${this._path}/bin/tuf-rgb`;
        const argv = Array.isArray(args) ? [bin, ...args] : [bin, args];
        try {
            const proc = Gio.Subprocess.new(
                argv,
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
