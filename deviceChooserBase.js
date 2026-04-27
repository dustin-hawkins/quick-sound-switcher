/*
 * Core device management logic shared by output and input choosers.
 * Manages Gvc.MixerControl interaction, device map, filtering, cycling.
 *
 * Original Author: Gopi Sankar Karmegam
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GLib from 'gi://GLib';
import Gvc from 'gi://Gvc';
import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';

import {SignalManager} from './signalManager.js';
import * as Port from './portSettings.js';

const _d = Port._log;

/**
 * DeviceChooserBase — pure logic class (not a UI widget).
 *
 * Subclass must implement:
 *   lookupDeviceById(control, id) → Gvc.MixerUIDevice | null
 *   changeDevice(control, uidevice)
 *   getDefaultStream(control) → Gvc.MixerStream | null
 *   getDefaultIcon() → string
 */
export class DeviceChooserBase {
    constructor(deviceType, settings, extensionDir, gettext) {
        this.deviceType = deviceType;
        this._settings = settings;
        this._extensionDir = extensionDir;
        this._ = gettext;
        this._devices = new Map();
        this._activeDeviceId = null;
        this._signalManager = new SignalManager();
        this._callbacks = {
            devicesChanged: [],
            activeChanged: [],
        };

        Port.setLog(this._settings.get_boolean(Port.ENABLE_LOG));
        this._signalManager.addSignal(this._settings,
            `changed::${Port.ENABLE_LOG}`, () => Port.setLog(this._settings.get_boolean(Port.ENABLE_LOG)));

        this._portsSettings = Port.getPortsFromSettings(this._settings);

        let control = this._getMixerControl();
        if (control.get_state() === Gvc.MixerControlState.READY)
            this._onControlReady(control);
        else
            this._signalManager.addSignal(control, 'state-changed', this._onControlStateChanged.bind(this));

        this._signalManager.addSignal(this._settings,
            `changed::${Port.PORT_SETTINGS}`, this._resetDevices.bind(this));
        this._signalManager.addSignal(this._settings,
            `changed::${Port.OMIT_DEVICE_ORIGIN}`, this._refreshDeviceTitles.bind(this));

        this._cardsRefreshedUnsub = Port.onCardsRefreshed(
            this._onCardsRefreshed.bind(this));
    }

    _onCardsRefreshed() {
        let control = this._getMixerControl();
        if (control.get_state() !== Gvc.MixerControlState.READY)
            return;
        let ids = Array.from(this._devices.keys());
        for (let id of ids) {
            let device = this._devices.get(id);
            if (!device)
                continue;
            let uidevice = this.lookupDeviceById(control, id);
            if (!uidevice)
                continue;
            device.profiles = Port.getProfiles(control, uidevice) || [];
            device.displayOption = Port.DISPLAY_OPTIONS.INITIAL;
        }
        this._emit('devicesChanged');
    }

    // --- Public API ---

    onDevicesChanged(cb) {
        this._callbacks.devicesChanged.push(cb);
    }

    onActiveChanged(cb) {
        this._callbacks.activeChanged.push(cb);
    }

    getDevices() {
        return this._devices;
    }

    getAvailableDevices() {
        return Array.from(this._devices.values()).filter(d => d.available);
    }

    getActiveDeviceId() {
        return this._activeDeviceId;
    }

    getActiveDevice() {
        return this._activeDeviceId ? this._devices.get(this._activeDeviceId) : null;
    }

    getDeviceVisibility() {
        let hideOnSingle = this._settings.get_boolean(Port.HIDE_ON_SINGLE_DEVICE);
        let count = this.getAvailableDevices().length;
        return hideOnSingle ? count > 1 : count > 0;
    }

    isEnabled() {
        let key = `show-${this.deviceType}-devices`;
        return this._settings.get_boolean(key);
    }

    cycleDevice(direction) {
        let devices = this.getAvailableDevices();
        if (devices.length <= 1)
            return null;

        let currentIdx = devices.findIndex(d => d.id === this._activeDeviceId);
        if (currentIdx < 0)
            return null;

        let nextIdx = (((currentIdx + direction) % devices.length) + devices.length) % devices.length;
        let nextDevice = devices[nextIdx];
        this._changeDeviceBase(nextDevice.id);
        return nextDevice;
    }

    activateDevice(id) {
        this._changeDeviceBase(id);
    }

    activateProfile(id, profileName) {
        let control = this._getMixerControl();
        let uidevice = this.lookupDeviceById(control, id);
        if (!uidevice) {
            this._deviceRemoved(control, id);
            return;
        }
        let stream = control.get_stream_from_device(uidevice);
        if (!stream) {
            _d(`No stream for device ${id}, skipping profile change`);
            return;
        }
        if (id !== this._activeDeviceId)
            this._changeDeviceBase(id, control);
        control.change_profile_on_selected_device(uidevice, profileName);
    }

    refreshActiveProfiles() {
        let control = this._getMixerControl();
        this._devices.forEach(device => {
            if (!device.available)
                return;
            let uidevice = this.lookupDeviceById(control, device.id);
            if (!uidevice) {
                this._deviceRemoved(control, device.id);
                return;
            }
            let stream = control.get_stream_from_device(uidevice);
            if (!stream)
                return;
            let activeProfile = uidevice.get_active_profile();
            if (activeProfile && device.activeProfile !== activeProfile) {
                device.activeProfile = activeProfile;
            }
        });
    }

    getIcon(name) {
        let iconsType = this._settings.get_string(Port.ICON_THEME);
        switch (iconsType) {
        case Port.ICON_THEME_COLORED:
            return name;
        case Port.ICON_THEME_MONOCHROME:
            return `${name}-symbolic`;
        default:
            return null;
        }
    }

    destroy() {
        if (this._cardsRefreshedUnsub) {
            this._cardsRefreshedUnsub();
            this._cardsRefreshedUnsub = null;
        }
        this._signalManager.disconnectAll();
        if (this._deviceRemovedTimeout) {
            GLib.source_remove(this._deviceRemovedTimeout);
            this._deviceRemovedTimeout = null;
        }
        this._devices.clear();
        this._callbacks.devicesChanged = [];
        this._callbacks.activeChanged = [];
    }

    // --- Abstract (must override) ---

    lookupDeviceById(_control, _id) {
        throw new Error('Not implemented');
    }

    changeDevice(_control, _uidevice) {
        throw new Error('Not implemented');
    }

    getDefaultStream(_control) {
        throw new Error('Not implemented');
    }

    getDefaultIcon() {
        return 'audio-card';
    }

    // --- Private ---

    _getMixerControl() {
        return Volume.getMixerControl();
    }

    _emit(type, ...args) {
        this._callbacks[type]?.forEach(cb => {
            try {
                cb(...args);
            } catch (e) {
                console.error(`SDC callback error: ${e}`);
            }
        });
    }

    _onControlStateChanged(control) {
        if (control.get_state() === Gvc.MixerControlState.READY)
            this._onControlReady(control);
    }

    _onControlReady(control) {
        // Prevent duplicate signal registration on reconnect
        this._signalManager.disconnectBySource(control);

        this._signalManager.addSignal(control,
            `${this.deviceType}-added`, this._deviceAdded.bind(this));
        this._signalManager.addSignal(control,
            `${this.deviceType}-removed`, this._deviceRemoved.bind(this));
        this._signalManager.addSignal(control,
            `active-${this.deviceType}-update`, this._deviceActivated.bind(this));

        this._signalManager.addSignal(this._settings,
            `changed::${Port.HIDE_ON_SINGLE_DEVICE}`, () => this._emit('devicesChanged'));
        this._signalManager.addSignal(this._settings,
            `changed::${Port.SHOW_PROFILES}`, () => this._emit('devicesChanged'));
        this._signalManager.addSignal(this._settings,
            `changed::${Port.ICON_THEME}`, () => this._emit('devicesChanged'));

        // Scan existing devices by enumerating streams and looking up UIDevices
        for (let stream of control.get_streams()) {
            let uidevice = control.lookup_device_from_stream(stream);
            if (uidevice)
                this._deviceAdded(control, uidevice.get_id());
        }

        // Activate default
        let defaultStream = this.getDefaultStream(control);
        if (defaultStream) {
            let defaultDevice = control.lookup_device_from_stream(defaultStream);
            if (defaultDevice)
                this._deviceActivated(control, defaultDevice.get_id());
        }
    }

    _isDeviceInvalid(uidevice) {
        return !uidevice || (uidevice.description != null &&
            uidevice.description.match(/(Dummy|EasyEffects|JamesDSP)\s+(Output|Input|Sink|Source)/gi));
    }

    _getDeviceTitle(uidevice) {
        let title = uidevice.description;
        if (!this._settings.get_boolean(Port.OMIT_DEVICE_ORIGIN) && uidevice.origin !== '')
            title = `${uidevice.origin}: ${title}`;
        return title;
    }

    _deviceAdded(control, id, dontcheck) {
        let device = this._devices.get(id);
        let uidevice = this.lookupDeviceById(control, id);

        if (!device) {
            if (this._isDeviceInvalid(uidevice))
                return;

            let title = this._getDeviceTitle(uidevice);
            let icon = uidevice.get_icon_name();
            if (!icon || icon.trim() === '')
                icon = this.getDefaultIcon();

            let profiles = Port.getProfiles(control, uidevice);

            device = {
                id,
                title,
                icon_name: icon,
                profiles: profiles || [],
                available: true,
                activeDevice: false,
                activeProfile: '',
                displayOption: Port.DISPLAY_OPTIONS.INITIAL,
            };

            let stream = control.get_stream_from_device(uidevice);
            if (stream)
                device.activeProfile = uidevice.get_active_profile() || '';

            this._devices.set(id, device);
        } else if (!device.available) {
            device.available = true;
        } else {
            return;
        }

        if (!dontcheck && !this._canShowDevice(control, uidevice, device, uidevice.port_available)) {
            this._deviceRemoved(control, id, true);
        } else {
            this._emit('devicesChanged');
        }
    }

    _deviceRemoved(control, id, _dontcheck) {
        let device = this._devices.get(id);
        if (device && device.available) {
            _d(`Removed: ${id}:${device.title}`);
            device.available = false;
            this._emit('devicesChanged');
        }
    }

    _deviceActivated(control, id) {
        _d(`Activated: ${id}`);
        let device = this._devices.get(id);
        if (!device) {
            this._deviceAdded(control, id);
            device = this._devices.get(id);
        }
        if (!device || id === this._activeDeviceId)
            return;

        // Check hidden device policy
        if (this._settings.get_boolean(Port.CANNOT_ACTIVATE_HIDDEN_DEVICE) &&
            device.displayOption === Port.DISPLAY_OPTIONS.HIDE_ALWAYS) {
            let fallback = this._activeDeviceId
                ? this._devices.get(this._activeDeviceId)
                : this.getAvailableDevices().find(d => d.id !== id);
            if (fallback) {
                this._changeDeviceBase(fallback.id, control);
                return;
            }
        }

        // Deactivate previous
        let prevId = this._activeDeviceId;
        if (prevId) {
            let prevDevice = this._devices.get(prevId);
            if (prevDevice) {
                prevDevice.activeDevice = false;
                if (prevDevice.displayOption === Port.DISPLAY_OPTIONS.HIDE_ALWAYS)
                    this._deviceRemoved(control, prevId, true);
            }
        }

        this._activeDeviceId = id;
        device.activeDevice = true;
        if (!device.available)
            this._deviceAdded(control, id);

        this._emit('activeChanged', device);
        this._emit('devicesChanged');
    }

    _changeDeviceBase(id, control) {
        if (!control)
            control = this._getMixerControl();
        let uidevice = this.lookupDeviceById(control, id);
        if (uidevice) {
            let stream = control.get_stream_from_device(uidevice);
            if (!stream) {
                _d(`No stream for device ${id}, skipping device change`);
                return;
            }
            this.changeDevice(control, uidevice);
        } else {
            this._deviceRemoved(control, id);
        }
    }

    _getDeviceDisplayOption(control, uidevice, device) {
        let displayOption = Port.DISPLAY_OPTIONS.DEFAULT;
        if (!uidevice || !uidevice.port_name || !uidevice.description)
            return displayOption;

        let stream = control.get_stream_from_device(uidevice);
        let cardName = null;
        if (stream) {
            let cardId = stream.get_card_index();
            if (cardId != null) {
                let card = Port.getCard(cardId);
                if (card)
                    cardName = card.name;
                else
                    return Port.DISPLAY_OPTIONS.DEFAULT;
            }
        }

        let matchedPort = this._portsSettings.find(port =>
            port && port.name === uidevice.port_name &&
            port.human_name === uidevice.description &&
            (!cardName || port.card_name === cardName) &&
            (cardName || port.card_description === uidevice.origin));

        if (matchedPort)
            displayOption = matchedPort.display_option;

        if (device)
            device.displayOption = displayOption;

        return displayOption;
    }

    _canShowDevice(control, uidevice, device, defaultValue) {
        if (!uidevice || !this._portsSettings || !uidevice.port_name ||
            !uidevice.description || (this._activeDeviceId && this._activeDeviceId === uidevice.get_id()))
            return defaultValue;

        let displayOption = device.displayOption;
        if (displayOption === Port.DISPLAY_OPTIONS.INITIAL)
            displayOption = this._getDeviceDisplayOption(control, uidevice, device);

        if (displayOption === Port.DISPLAY_OPTIONS.SHOW_ALWAYS)
            return true;
        else if (displayOption === Port.DISPLAY_OPTIONS.HIDE_ALWAYS)
            return false;
        return defaultValue;
    }

    _resetDevices() {
        this._portsSettings = Port.getPortsFromSettings(this._settings);
        let control = this._getMixerControl();
        this._devices.forEach((device, id) => {
            device.displayOption = Port.DISPLAY_OPTIONS.INITIAL;
            let uidevice = this.lookupDeviceById(control, id);
            if (this._isDeviceInvalid(uidevice))
                return;
            if (this._canShowDevice(control, uidevice, device, uidevice.port_available))
                this._deviceAdded(control, id, true);
            else
                this._deviceRemoved(control, id, true);
        });
        this._emit('devicesChanged');
    }

    _refreshDeviceTitles() {
        let control = this._getMixerControl();
        this._devices.forEach((device, id) => {
            let uidevice = this.lookupDeviceById(control, id);
            if (uidevice)
                device.title = this._getDeviceTitle(uidevice);
        });
        this._emit('devicesChanged');
        this._emit('activeChanged', this.getActiveDevice());
    }
}

export class OutputDeviceChooser extends DeviceChooserBase {
    constructor(settings, extensionDir, gettext) {
        super('output', settings, extensionDir, gettext);
    }

    lookupDeviceById(control, id) {
        return control.lookup_output_id(id);
    }

    changeDevice(control, uidevice) {
        control.change_output(uidevice);
    }

    getDefaultStream(control) {
        return control.get_default_sink();
    }

    getDefaultIcon() {
        return 'audio-card';
    }
}

export class InputDeviceChooser extends DeviceChooserBase {
    constructor(settings, extensionDir, gettext) {
        super('input', settings, extensionDir, gettext);
    }

    lookupDeviceById(control, id) {
        return control.lookup_input_id(id);
    }

    changeDevice(control, uidevice) {
        control.change_input(uidevice);
    }

    getDefaultStream(control) {
        return control.get_default_source();
    }

    getDefaultIcon() {
        return 'audio-input-microphone';
    }
}
