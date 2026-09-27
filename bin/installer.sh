#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Przemek
# SPDX-License-Identifier: GPL-2.0-or-later

# installer.sh - Udev rule manager for TUF Keyboard RGB extension
# Configures device permissions for ASUS TUF ITE5570 LampArray controller.

set -euo pipefail

RULE_FILE="/etc/udev/rules.d/99-tuf-rgb.rules"
RULE_CONTENT='SUBSYSTEM=="hidraw", KERNELS=="i2c-ITE5570*", TAG+="uaccess", MODE="0666"'

find_ite_devs() {
    for d in /sys/class/hidraw/hidraw*; do
        if [ -f "$d/device/uevent" ] && grep -q 'ITE5570' "$d/device/uevent" 2>/dev/null; then
            echo "/dev/$(basename "$d")"
        fi
    done
}

do_install() {
    echo "Installing TUF RGB udev rule to ${RULE_FILE}..."
    echo "${RULE_CONTENT}" > "${RULE_FILE}"
    chmod 0644 "${RULE_FILE}"

    echo "Reloading udev rules..."
    udevadm control --reload
    udevadm trigger --subsystem-match=hidraw || udevadm trigger
    udevadm settle -t 2 || true

    for dev in $(find_ite_devs); do
        if [ -e "$dev" ]; then
            chmod 0666 "$dev"
        fi
    done
    echo "Installation successful."
}

do_remove() {
    echo "Removing TUF RGB udev rule..."
    rm -f "${RULE_FILE}"

    echo "Reloading udev rules..."
    udevadm control --reload
    udevadm trigger --subsystem-match=hidraw || udevadm trigger
    udevadm settle -t 2 || true

    for dev in $(find_ite_devs); do
        if [ -e "$dev" ]; then
            chmod 0600 "$dev"
        fi
    done
    echo "Removal successful."
}

do_check() {
    if [ ! -f "${RULE_FILE}" ]; then
        exit 2
    fi
    for dev in $(find_ite_devs); do
        if [ -w "$dev" ] && [ -r "$dev" ]; then
            exit 0
        fi
    done
    exit 2
}

case "${1:-}" in
    install)
        do_install
        ;;
    remove|uninstall)
        do_remove
        ;;
    check)
        do_check
        ;;
    *)
        echo "Usage: $0 {install|remove|check}" >&2
        exit 1
        ;;
esac
