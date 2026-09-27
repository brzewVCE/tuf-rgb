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

        // 1. Device Permissions Group
        const permGroup = new Adw.PreferencesGroup({
            title: _('Device Permissions'),
            description: _('A udev rule is required so non-root users can control the ASUS TUF keyboard RGB lighting without administrator password prompts.'),
        });

        const permRow = new Adw.ActionRow({
            title: _('Udev Access Rule'),
            subtitle: _('Checking permission status...'),
        });

        const actionBtn = new Gtk.Button({
            valign: Gtk.Align.CENTER,
            label: _('Checking...'),
            sensitive: false,
        });

        permRow.add_suffix(actionBtn);
        permRow.set_activatable_widget(actionBtn);
        permGroup.add(permRow);
        page.add(permGroup);

        // 2. Hardware Information Group
        const infoGroup = new Adw.PreferencesGroup({
            title: _('Hardware Information'),
        });

        const ctrlRow = new Adw.ActionRow({
            title: _('Controller'),
            subtitle: 'ITE5570 (LampArray, Usage Page 0x59)',
        });
        infoGroup.add(ctrlRow);

        const devRow = new Adw.ActionRow({
            title: _('Device Node'),
            subtitle: _('Detecting...'),
        });
        infoGroup.add(devRow);

        const modelsRow = new Adw.ActionRow({
            title: _('Supported Models'),
            subtitle: 'ASUS TUF Gaming A16 / F15 / A15 / Dash',
        });
        infoGroup.add(modelsRow);

        page.add(infoGroup);
        window.add(page);

        // Status update logic
        const refreshStatus = () => {
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
                        actionBtn.set_sensitive(true);

                        actionBtn.remove_css_class('suggested-action');
                        actionBtn.remove_css_class('destructive-action');

                        if (code === 0) {
                            permRow.set_subtitle(_('Installed and active. Keyboard backlight is accessible.'));
                            permRow.set_icon_name('emblem-ok-symbolic');
                            actionBtn.set_label(_('Remove'));
                            actionBtn.add_css_class('destructive-action');
                            actionBtn._action = 'remove';
                        } else if (code === 2) {
                            permRow.set_subtitle(_('Not configured. Permission denied on device node.'));
                            permRow.set_icon_name('dialog-warning-symbolic');
                            actionBtn.set_label(_('Install'));
                            actionBtn.add_css_class('suggested-action');
                            actionBtn._action = 'install';
                        } else {
                            permRow.set_subtitle(_('Device not detected.'));
                            permRow.set_icon_name('dialog-warning-symbolic');
                            actionBtn.set_label(_('Retry'));
                            actionBtn._action = 'check';
                        }
                    } catch (e) {
                        permRow.set_subtitle(_('Failed to determine permission status.'));
                        actionBtn.set_sensitive(true);
                    }
                });
            } catch (e) {
                permRow.set_subtitle(_('Helper binary unavailable.'));
                actionBtn.set_sensitive(true);
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
                            devRow.set_subtitle(dev);
                        } else {
                            devRow.set_subtitle(_('Not detected'));
                        }
                    } catch (e) {
                        devRow.set_subtitle(_('Unknown'));
                    }
                });
            } catch (e) {}
        };

        const runPolkitAction = action => {
            if (action === 'check') {
                refreshStatus();
                return;
            }

            actionBtn.set_sensitive(false);

            const installer = `${this.path}/bin/installer.sh`;

            // Restore executable bit if needed
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
                            actionBtn.remove_css_class('suggested-action');
                            actionBtn.remove_css_class('destructive-action');

                            if (action === 'install') {
                                toast.set_title(_('Permissions installed successfully.'));
                                permRow.set_subtitle(_('Installed and active. Keyboard backlight is accessible.'));
                                permRow.set_icon_name('emblem-ok-symbolic');
                                actionBtn.set_label(_('Remove'));
                                actionBtn.add_css_class('destructive-action');
                                actionBtn._action = 'remove';
                            } else {
                                toast.set_title(_('Permissions rule removed.'));
                                permRow.set_subtitle(_('Not configured. Permission denied on device node.'));
                                permRow.set_icon_name('dialog-warning-symbolic');
                                actionBtn.set_label(_('Install'));
                                actionBtn.add_css_class('suggested-action');
                                actionBtn._action = 'install';
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
                        actionBtn.set_sensitive(true);
                        // Confirm state after background udev settles
                        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 400, () => {
                            refreshStatus();
                            return GLib.SOURCE_REMOVE;
                        });
                    }
                });
            } catch (e) {
                actionBtn.set_sensitive(true);
            }
        };

        actionBtn.connect('clicked', () => {
            runPolkitAction(actionBtn._action);
        });

        refreshStatus();
    }
}
