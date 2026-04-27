/*
 * Input device QuickSettings indicator.
 * SystemIndicator + QuickMenuToggle for selecting audio input devices.
 *
 * Original Author: Gopi Sankar Karmegam
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GObject from 'gi://GObject';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import {InputDeviceChooser} from './deviceChooserBase.js';
import * as Port from './portSettings.js';

const InputDeviceToggle = GObject.registerClass(
class InputDeviceToggle extends QuickSettings.QuickMenuToggle {
    _init() {
        super._init({
            title: 'Input',
            iconName: 'audio-input-microphone-symbolic',
            toggleMode: false,
        });
    }
});

export const InputDeviceIndicator = GObject.registerClass(
class InputDeviceIndicator extends QuickSettings.SystemIndicator {
    _init(settings, extensionDir, gettext) {
        super._init();
        this._settings = settings;
        this._ = gettext;

        this._toggle = new InputDeviceToggle();
        this._toggle.menu.setHeader('audio-input-microphone-symbolic', gettext('Input Devices'));
        this.quickSettingsItems.push(this._toggle);

        this._chooser = new InputDeviceChooser(settings, extensionDir, gettext);
        this._menuItems = new Map();
        this._profileItems = new Map();

        this._chooser.onDevicesChanged(() => this._rebuildMenu());
        this._chooser.onActiveChanged(device => this._updateActiveDevice(device));

        this._menuOpenId = this._toggle.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._chooser.refreshActiveProfiles();
        });

        this._settingsSignals = [];
        this._settingsSignals.push(
            this._settings.connect(`changed::${Port.SHOW_INPUT_DEVICES}`,
                () => this._updateVisibility()));
        this._settingsSignals.push(
            this._settings.connect(`changed::${Port.HIDE_ON_SINGLE_DEVICE}`,
                () => this._updateVisibility()));

        this._rebuildMenu();
        this._updateVisibility();
    }

    get chooser() {
        return this._chooser;
    }

    _updateVisibility() {
        let enabled = this._settings.get_boolean(Port.SHOW_INPUT_DEVICES);
        let hasDevices = this._chooser.getDeviceVisibility();
        this._toggle.visible = enabled && hasDevices;
    }

    _updateActiveDevice(device) {
        if (!device)
            return;
        this._toggle.subtitle = device.title;
        let iconName = this._chooser.getIcon(device.icon_name);
        if (iconName) {
            this._toggle.iconName = iconName;
            this._toggle.menu.setHeader(iconName, this._('Input Devices'));
        }
    }

    _rebuildMenu() {
        this._menuItems.forEach(item => item.destroy());
        this._menuItems.clear();
        this._profileItems.forEach(items => items.forEach(item => item.destroy()));
        this._profileItems.clear();

        let devices = this._chooser.getAvailableDevices();
        let showProfiles = this._settings.get_boolean(Port.SHOW_PROFILES);

        for (let device of devices) {
            let iconName = this._chooser.getIcon(device.icon_name) || 'audio-input-microphone-symbolic';
            let item = new PopupMenu.PopupImageMenuItem(device.title, iconName);

            if (device.activeDevice)
                item.setOrnament(PopupMenu.Ornament.CHECK);
            else
                item.setOrnament(PopupMenu.Ornament.NONE);

            item.connect('activate', () => {
                this._chooser.activateDevice(device.id);
            });

            this._toggle.menu.addMenuItem(item);
            this._menuItems.set(device.id, item);

            if (showProfiles && device.profiles.length > 0) {
                let profileItems = [];
                for (let profile of device.profiles) {
                    let pItem = new PopupMenu.PopupMenuItem(
                        `  ${this._('Profile')}: ${profile.human_name}`);
                    pItem.setOrnament(
                        device.activeProfile === profile.name
                            ? PopupMenu.Ornament.DOT
                            : PopupMenu.Ornament.NONE);
                    if (device.activeProfile !== profile.name) {
                        pItem.add_style_pseudo_class('insensitive');
                    } else {
                        pItem.reactive = false;
                    }

                    pItem.connect('activate', () => {
                        this._chooser.activateProfile(device.id, profile.name);
                    });
                    this._toggle.menu.addMenuItem(pItem);
                    profileItems.push(pItem);
                }
                this._profileItems.set(device.id, profileItems);
            }
        }

        this._updateVisibility();
    }

    destroy() {
        this._settingsSignals.forEach(id => this._settings.disconnect(id));
        this._settingsSignals = [];
        if (this._menuOpenId) {
            this._toggle.menu.disconnect(this._menuOpenId);
            this._menuOpenId = null;
        }
        this._chooser?.destroy();
        this._menuItems.forEach(item => item.destroy());
        this._menuItems.clear();
        this._profileItems.forEach(items => items.forEach(item => item.destroy()));
        this._profileItems.clear();
        this._toggle?.destroy();
        super.destroy();
    }
});
