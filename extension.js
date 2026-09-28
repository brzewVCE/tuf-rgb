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
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

const SliderWidget = Slider.Slider || Slider.default || Slider;

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

const EFFECTS = [
    {id: 'static', label: 'Static'},
    {id: 'breathe', label: 'Breathe'},
    {id: 'heartbeat', label: 'Heartbeat'},
    {id: 'cycle', label: 'Cycle'},
];

const RESTORE_RETRY_DELAYS_MS = [500, 1500, 3000];
const INITIAL_WAKE_DELAY_MS = 500;

/**
 * Custom PopupBaseMenuItem displaying a row of 8 color swatches with active checkmark.
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
        this._buttons = new Map();

        if (this._ornamentIcon) {
            this.remove_child(this._ornamentIcon);
            this._ornamentIcon.destroy();
            this._ornamentIcon = null;
        }

        this._box = new St.BoxLayout({
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

            const isBright = (c.cmd === 'white' || c.cmd === 'yellow');
            const checkLabel = new St.Label({
                text: '✓',
                style_class: isBright ? 'tuf-rgb-swatch-check tuf-rgb-swatch-check-dark' : 'tuf-rgb-swatch-check',
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                visible: false,
            });
            btn.set_child(checkLabel);

            btn.connect('clicked', () => this._onColorSelected(c.cmd));
            this._box.add_child(btn);
            this._buttons.set(c.cmd, {btn, checkLabel});
        }

        this.add_child(this._box);
    }

    setActiveColor(colorCmd, isDimmed = false) {
        if (isDimmed) {
            this._box.add_style_class_name('tuf-rgb-palette-dimmed');
            for (const {btn, checkLabel} of this._buttons.values()) {
                btn.remove_style_class_name('tuf-rgb-swatch-active');
                checkLabel.visible = false;
            }
            return;
        }

        this._box.remove_style_class_name('tuf-rgb-palette-dimmed');
        for (const [cmd, {btn, checkLabel}] of this._buttons.entries()) {
            const isActive = (cmd === colorCmd);
            if (isActive) {
                btn.add_style_class_name('tuf-rgb-swatch-active');
                checkLabel.visible = true;
            } else {
                btn.remove_style_class_name('tuf-rgb-swatch-active');
                checkLabel.visible = false;
            }
        }
    }
}

/**
 * Custom PopupBaseMenuItem displaying pill toggle buttons for effect presets.
 */
class EffectPillsItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(onEffectSelected) {
        super({
            reactive: false,
            can_focus: false,
            style_class: 'tuf-rgb-effects-item',
        });

        this._onEffectSelected = onEffectSelected;
        this._buttons = new Map();

        if (this._ornamentIcon) {
            this.remove_child(this._ornamentIcon);
            this._ornamentIcon.destroy();
            this._ornamentIcon = null;
        }

        const box = new St.BoxLayout({
            style_class: 'tuf-rgb-effects-box',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        for (const eff of EFFECTS) {
            let labelText = eff.label;
            try {
                labelText = _(eff.label);
            } catch (e) {}

            const btn = new St.Button({
                style_class: 'button tuf-rgb-pill',
                can_focus: true,
                track_hover: true,
                toggle_mode: true,
                label: labelText,
            });
            btn.connect('clicked', () => this._onEffectSelected(eff.id));
            box.add_child(btn);
            this._buttons.set(eff.id, btn);
        }

        this.add_child(box);
    }

    setActiveEffect(activeId) {
        for (const [id, btn] of this._buttons.entries()) {
            const isActive = (id === activeId);
            btn.checked = isActive;
            if (isActive) {
                btn.add_style_class_name('tuf-rgb-pill-active');
                btn.add_style_class_name('default');
            } else {
                btn.remove_style_class_name('tuf-rgb-pill-active');
                btn.remove_style_class_name('default');
            }
        }
    }
}

/**
 * Custom PopupBaseMenuItem displaying a speed slider with turtle and rabbit icons.
 */
class SpeedSliderItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(onSpeedChanged, extensionPath, initialSpeed = 0.5) {
        super({
            reactive: true,
            can_focus: false,
            style_class: 'tuf-rgb-speed-item',
        });

        this._onSpeedChanged = onSpeedChanged;
        this._path = extensionPath;
        this._debounceId = null;

        if (this._ornamentIcon) {
            this.remove_child(this._ornamentIcon);
            this._ornamentIcon.destroy();
            this._ornamentIcon = null;
        }

        const box = new St.BoxLayout({
            style_class: 'tuf-rgb-speed-box',
            x_align: Clutter.ActorAlign.FILL,
            x_expand: true,
        });

        this._slider = new SliderWidget(initialSpeed);
        this._slider.x_expand = true;
        this._slider.y_align = Clutter.ActorAlign.CENTER;
        this._slider.connect('notify::value', () => {
            if (this._debounceId) {
                GLib.source_remove(this._debounceId);
                this._debounceId = null;
            }
            this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
                this._debounceId = null;
                this._onSpeedChanged(this._slider.value);
                return GLib.SOURCE_REMOVE;
            });
        });
        box.add_child(this._slider);

        this.add_child(box);
    }

    setSpeed(speedVal) {
        if (this._slider)
            this._slider.value = Math.max(0.05, Math.min(1.0, speedVal));
    }

    setEnabled(enabled) {
        if (enabled) {
            this.remove_style_class_name('tuf-rgb-speed-item-disabled');
            if (this._slider)
                this._slider.reactive = true;
        } else {
            this.add_style_class_name('tuf-rgb-speed-item-disabled');
            if (this._slider)
                this._slider.reactive = false;
        }
    }

    destroy() {
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = null;
        }
        super.destroy();
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
        const stateFile = `${GLib.get_home_dir()}/.config/tuf-rgb/state.json`;
        try {
            const [ok, contents] = GLib.file_get_contents(stateFile);
            if (ok) {
                const state = JSON.parse(new TextDecoder().decode(contents));
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
        } catch (e) {
            // Ignore parse errors on missing/empty state
        }
    }

    _onColorSelected(cmd) {
        // Approach 1: If cycle is active, selecting a color exits cycle to static mode
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

/**
 * Manages injection, sleep/resume persistence, and lifecycle within GNOME QuickSettings.
 */
class KeyboardColorManager {
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

export default class TufRgbExtension extends Extension {
    enable() {
        this._manager = new KeyboardColorManager(this);
    }

    disable() {
        this._manager?.destroy();
        delete this._manager;
    }
}
