// SPDX-FileCopyrightText: 2026 Przemek
// SPDX-License-Identifier: GPL-2.0-or-later

// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TufRgbPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this.initTranslations();
        window.set_default_size(580, 500);

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.connect('close-request', () => {
            this._permissionRow = null;
            this._actionButton = null;
            this._refreshButton = null;
            this._deviceRow = null;
        });

        this._setupPermissionsGroup(page, window);
        this._setupHardwareGroup(page);

        window.add(page);
        this._refreshPermissionStatus();
    }

    _setupPermissionsGroup(page, window) {
        const permissionsGroup = new Adw.PreferencesGroup({
            title: _('Device Permissions'),
            description: _('A udev rule is required so non-root users can control the ASUS TUF keyboard RGB lighting without administrator password prompts.'),
        });

        this._permissionRow = new Adw.ActionRow({
            title: _('Udev Access Rule'),
            subtitle: _('Checking permission status...'),
        });

        this._actionButton = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            label: _('Checking...'),
            sensitive: false,
        });

        this._actionButton.connect('clicked', () => {
            this._handlePermissionAction(this._actionButton._action, window);
        });

        this._refreshButton = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            icon_name: 'view-refresh-symbolic',
            tooltip_text: _('Refresh permission status'),
        });
        this._refreshButton.connect('clicked', () => this._refreshPermissionStatus());

        this._permissionRow.add_suffix(this._actionButton);
        this._permissionRow.add_suffix(this._refreshButton);
        this._permissionRow.set_activatable_widget(this._actionButton);
        permissionsGroup.add(this._permissionRow);
        page.add(permissionsGroup);
    }

    _setupHardwareGroup(page) {
        const hardwareGroup = new Adw.PreferencesGroup({
            title: _('Hardware Information'),
        });

        const controllerRow = new Adw.ActionRow({
            title: _('Controller'),
            subtitle: 'ITE5570 (LampArray, Usage Page 0x59)',
        });
        hardwareGroup.add(controllerRow);

        this._deviceRow = new Adw.ActionRow({
            title: _('Device Node'),
            subtitle: _('Detecting...'),
        });
        hardwareGroup.add(this._deviceRow);

        const modelsRow = new Adw.ActionRow({
            title: _('Supported Models'),
            subtitle: 'ASUS TUF Gaming A16 / A18 / F15 / A15 / Dash',
        });
        hardwareGroup.add(modelsRow);

        page.add(hardwareGroup);
    }

    _refreshPermissionStatus() {
        const binaryPath = `${this.path}/bin/tuf-rgb`;

        // Check permissions
        try {
            const permissionProc = Gio.Subprocess.new(
                [binaryPath, 'check'],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            permissionProc.wait_async(null, (procHandle, asyncResult) => {
                try {
                    procHandle.wait_finish(asyncResult);
                    const exitCode = procHandle.get_exit_status();
                    this._actionButton?.set_sensitive(true);

                    this._actionButton?.remove_css_class('suggested-action');
                    this._actionButton?.remove_css_class('destructive-action');

                    if (exitCode === 0) {
                        this._permissionRow?.set_subtitle(_('Installed and active. Keyboard backlight is accessible.'));
                        this._permissionRow?.set_icon_name('emblem-ok-symbolic');
                        this._actionButton?.set_label(_('Remove (Copy)'));
                        this._actionButton?.add_css_class('destructive-action');
                        if (this._actionButton) {
                            this._actionButton._action = 'remove';
                        }
                    } else if (exitCode === 2) {
                        this._permissionRow?.set_subtitle(_('Not configured. Permission denied on device node.'));
                        this._permissionRow?.set_icon_name('dialog-warning-symbolic');
                        this._actionButton?.set_label(_('Install (Copy)'));
                        this._actionButton?.add_css_class('suggested-action');
                        if (this._actionButton) {
                            this._actionButton._action = 'install';
                        }
                    } else {
                        this._permissionRow?.set_subtitle(_('Device not detected.'));
                        this._permissionRow?.set_icon_name('dialog-warning-symbolic');
                        this._actionButton?.set_label(_('Retry'));
                        if (this._actionButton) {
                            this._actionButton._action = 'check';
                        }
                    }
                } catch (e) {
                    this._permissionRow?.set_subtitle(_('Failed to determine permission status.'));
                    this._actionButton?.set_sensitive(true);
                }
            });
        } catch (e) {
            this._permissionRow?.set_subtitle(_('Helper binary unavailable.'));
            this._actionButton?.set_sensitive(true);
        }

        // Detect device path
        try {
            const deviceProc = Gio.Subprocess.new(
                [binaryPath, 'device'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            deviceProc.communicate_utf8_async(null, null, (procHandle, asyncResult) => {
                try {
                    const [, stdoutOutput] = procHandle.communicate_utf8_finish(asyncResult);
                    const detectedDeviceNode = stdoutOutput?.trim();
                    if (detectedDeviceNode) {
                        this._deviceRow?.set_subtitle(detectedDeviceNode);
                    } else {
                        this._deviceRow?.set_subtitle(_('Not detected'));
                    }
                } catch (e) {
                    this._deviceRow?.set_subtitle(_('Unknown'));
                }
            });
        } catch (e) {}
    }

    _handlePermissionAction(permissionAction, window) {
        if (permissionAction === 'check') {
            this._refreshPermissionStatus();
            return;
        }

        let bashCommand = '';
        let toastMessage = '';

        if (permissionAction === 'install') {
            bashCommand = 'sudo sh -c \'echo "SUBSYSTEM==\\"hidraw\\", KERNELS==\\"i2c-ITE5570*\\", TAG+=\\"uaccess\\", MODE=\\"0666\\"" > /etc/udev/rules.d/99-tuf-rgb.rules && udevadm control --reload && udevadm trigger\'';
            toastMessage = _('Install command copied to clipboard. Run it in terminal, then click Refresh.');
        } else if (permissionAction === 'remove') {
            bashCommand = 'sudo rm -f /etc/udev/rules.d/99-tuf-rgb.rules && sudo udevadm control --reload && sudo udevadm trigger';
            toastMessage = _('Remove command copied to clipboard. Run it in terminal, then click Refresh.');
        }

        if (bashCommand) {
            try {
                const systemClipboard = Gdk.Display.get_default()?.get_clipboard();
                systemClipboard?.set(bashCommand);
            } catch (clipboardError) {
                console.error(`[tuf-rgb] Failed to copy command to clipboard: ${clipboardError.message}`);
            }

            try {
                const statusToast = new Adw.Toast({
                    title: toastMessage,
                    timeout: 5,
                });
                window.add_toast(statusToast);
            } catch (toastError) {}
        }
    }
}
