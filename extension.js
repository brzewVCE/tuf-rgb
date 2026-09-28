// SPDX-FileCopyrightText: 2026 Przemek
// SPDX-License-Identifier: GPL-2.0-or-later

// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {KeyboardColorManager} from './lib/hardwareManager.js';

export default class TufRgbExtension extends Extension {
    enable() {
        this._manager = new KeyboardColorManager(this);
    }

    disable() {
        this._manager?.destroy();
        this._manager = null;
    }
}
