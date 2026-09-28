// SPDX-FileCopyrightText: 2026 Przemek
// SPDX-License-Identifier: GPL-2.0-or-later

// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {PALETTE} from './constants.js';

/**
 * Custom PopupBaseMenuItem displaying a row of 8 color swatches with active checkmark.
 */
export class ColorPaletteItem extends PopupMenu.PopupBaseMenuItem {
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
