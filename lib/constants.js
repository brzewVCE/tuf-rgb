// SPDX-FileCopyrightText: 2026 Przemek
// SPDX-License-Identifier: GPL-2.0-or-later

// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';

export const SliderWidget = Slider.Slider || Slider.default || Slider;

export const PALETTE = [
    {name: 'Red', hex: '#ff0000', cmd: 'red'},
    {name: 'Orange', hex: '#ff6600', cmd: 'orange'},
    {name: 'Yellow', hex: '#ffcc00', cmd: 'yellow'},
    {name: 'Green', hex: '#00e600', cmd: 'green'},
    {name: 'Cyan', hex: '#00d5ff', cmd: 'cyan'},
    {name: 'Blue', hex: '#0055ff', cmd: 'blue'},
    {name: 'Purple', hex: '#9900ff', cmd: 'purple'},
    {name: 'White', hex: '#ffffff', cmd: 'white'},
];

export const EFFECTS = [
    {id: 'static', label: 'Static'},
    {id: 'breathe', label: 'Breathe'},
    {id: 'heartbeat', label: 'Heartbeat'},
    {id: 'cycle', label: 'Cycle'},
];

export const RESTORE_RETRY_DELAYS_MS = [500, 1500, 3000];
export const INITIAL_WAKE_DELAY_MS = 500;
