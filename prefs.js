// SPDX-FileCopyrightText: 2026 Przemek
// SPDX-License-Identifier: GPL-2.0-or-later

// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TufRgbPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(580, 500);

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });

        this._setupPermissionsGroup(page, window);
        this._setupHardwareInfoGroup(page);

        window.add(page);
        this._refreshStatus();
    }

    _setupPermissionsGroup(page, window) {
        const permGroup = new Adw.PreferencesGroup({
            title: _('Device Permissions'),
            description: _('A udev rule is required so non-root users can control the ASUS TUF keyboard RGB lighting without administrator password prompts.'),
        });

        this._permRow = new Adw.ActionRow({
            title: _('Udev Access Rule'),
            subtitle: _('Checking permission status...'),
        });

        this._actionBtn = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            label: _('Checking...'),
            sensitive: false,
        });

        this._actionBtn.connect('clicked', () => {
            this._runPolkitAction(this._actionBtn._action, window);
        });

        this._permRow.add_suffix(this._actionBtn);
        this._permRow.set_activatable_widget(this._actionBtn);
        permGroup.add(this._permRow);
        page.add(permGroup);
    }

    _setupHardwareInfoGroup(page) {
        const infoGroup = new Adw.PreferencesGroup({
            title: _('Hardware Information'),
        });

        const ctrlRow = new Adw.ActionRow({
            title: _('Controller'),
            subtitle: 'ITE5570 (LampArray, Usage Page 0x59)',
        });
        infoGroup.add(ctrlRow);

        this._devRow = new Adw.ActionRow({
            title: _('Device Node'),
            subtitle: _('Detecting...'),
        });
        infoGroup.add(this._devRow);

        const modelsRow = new Adw.ActionRow({
            title: _('Supported Models'),
            subtitle: 'ASUS TUF Gaming A16 / A18 / F15 / A15 / Dash',
        });
        infoGroup.add(modelsRow);

        page.add(infoGroup);
    }

    _refreshStatus() {
        const bin = `${this.path}/bin/tuf-rgb`;

        // Check permissions
        try {
            const proc = Gio.Subprocess.new(
                [bin, 'check'],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.wait_async(null, (p, res) => {
                try {
                    p.wait_finish(res);
                    const code = p.get_exit_status();
                    this._actionBtn.set_sensitive(true);

                    this._actionBtn.remove_css_class('suggested-action');
                    this._actionBtn.remove_css_class('destructive-action');

                    if (code === 0) {
                        this._permRow.set_subtitle(_('Installed and active. Keyboard backlight is accessible.'));
                        this._permRow.set_icon_name('emblem-ok-symbolic');
                        this._actionBtn.set_label(_('Remove'));
                        this._actionBtn.add_css_class('destructive-action');
                        this._actionBtn._action = 'remove';
                    } else if (code === 2) {
                        this._permRow.set_subtitle(_('Not configured. Permission denied on device node.'));
                        this._permRow.set_icon_name('dialog-warning-symbolic');
                        this._actionBtn.set_label(_('Install'));
                        this._actionBtn.add_css_class('suggested-action');
                        this._actionBtn._action = 'install';
                    } else {
                        this._permRow.set_subtitle(_('Device not detected.'));
                        this._permRow.set_icon_name('dialog-warning-symbolic');
                        this._actionBtn.set_label(_('Retry'));
                        this._actionBtn._action = 'check';
                    }
                } catch (e) {
                    this._permRow.set_subtitle(_('Failed to determine permission status.'));
                    this._actionBtn.set_sensitive(true);
                }
            });
        } catch (e) {
            this._permRow.set_subtitle(_('Helper binary unavailable.'));
            this._actionBtn.set_sensitive(true);
        }

        // Detect device path
        try {
            const devProc = Gio.Subprocess.new(
                [bin, 'device'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            devProc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, stdout] = p.communicate_utf8_finish(res);
                    const dev = stdout?.trim();
                    if (dev) {
                        this._devRow.set_subtitle(dev);
                    } else {
                        this._devRow.set_subtitle(_('Not detected'));
                    }
                } catch (e) {
                    this._devRow.set_subtitle(_('Unknown'));
                }
            });
        } catch (e) {}
    }

    _runPolkitAction(action, window) {
        if (action === 'check') {
            this._refreshStatus();
            return;
        }

        this._actionBtn.set_sensitive(false);

        const installer = `${this.path}/bin/installer.sh`;

        try {
            GLib.chmod(installer, 0o755);
        } catch (e) {}

        try {
            const proc = Gio.Subprocess.new(
                ['pkexec', installer, action],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.wait_async(null, (p, res) => {
                try {
                    p.wait_finish(res);
                    const success = p.get_successful();
                    const toast = new Adw.Toast();

                    if (success) {
                        this._actionBtn.remove_css_class('suggested-action');
                        this._actionBtn.remove_css_class('destructive-action');

                        if (action === 'install') {
                            toast.set_title(_('Permissions installed successfully.'));
                            this._permRow.set_subtitle(_('Installed and active. Keyboard backlight is accessible.'));
                            this._permRow.set_icon_name('emblem-ok-symbolic');
                            this._actionBtn.set_label(_('Remove'));
                            this._actionBtn.add_css_class('destructive-action');
                            this._actionBtn._action = 'remove';
                        } else {
                            toast.set_title(_('Permissions rule removed.'));
                            this._permRow.set_subtitle(_('Not configured. Permission denied on device node.'));
                            this._permRow.set_icon_name('dialog-warning-symbolic');
                            this._actionBtn.set_label(_('Install'));
                            this._actionBtn.add_css_class('suggested-action');
                            this._actionBtn._action = 'install';
                        }
                    } else {
                        toast.set_title(_('Operation cancelled or failed.'));
                    }

                    try {
                        window.add_toast(toast);
                    } catch (e) {}
                } catch (e) {
                    try {
                        const toast = new Adw.Toast({
                            title: _('Execution error occurred.'),
                        });
                        window.add_toast(toast);
                    } catch (err) {}
                } finally {
                    this._actionBtn.set_sensitive(true);
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                        this._refreshStatus();
                        return GLib.SOURCE_REMOVE;
                    });
                }
            });
        } catch (e) {
            this._actionBtn.set_sensitive(true);
        }
    }
}
