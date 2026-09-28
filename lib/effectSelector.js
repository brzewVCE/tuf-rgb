// SPDX-FileCopyrightText: 2026 Przemek
// SPDX-License-Identifier: GPL-2.0-or-later

// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {EFFECTS, SliderWidget} from './constants.js';

/**
 * Custom PopupBaseMenuItem displaying pill toggle buttons for effect presets.
 */
export class EffectPillsItem extends PopupMenu.PopupBaseMenuItem {
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
 * Custom PopupBaseMenuItem displaying a speed slider with debounced notifications.
 */
export class SpeedSliderItem extends PopupMenu.PopupBaseMenuItem {
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
