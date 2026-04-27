/*
 * Sound Input & Output Device Chooser
 * Main extension entry point for GNOME 45-50.
 *
 * Original Author: Gopi Sankar Karmegam
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Shell from 'gi://Shell';
import Meta from 'gi://Meta';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {OutputDeviceIndicator} from './outputDeviceChooser.js';
import {InputDeviceIndicator} from './inputDeviceChooser.js';
import {AppMixerIndicator} from './appMixer.js';
import * as Port from './portSettings.js';

export default class SDCExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        Port.setLog(this._settings.get_boolean(Port.ENABLE_LOG));
        Port.refreshCards(this.dir, this._settings);

        const gettext = this.gettext.bind(this);

        // Create indicators
        this._outputIndicator = new OutputDeviceIndicator(
            this._settings, this.dir, gettext);
        this._inputIndicator = new InputDeviceIndicator(
            this._settings, this.dir, gettext);
        this._appMixerIndicator = new AppMixerIndicator(
            this._settings, gettext);

        // Register with Quick Settings panel
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._outputIndicator);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._inputIndicator);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._appMixerIndicator);

        // Keybindings
        this._setupKeybindings();

        // Always-show input slider
        this._setupInputSliderVisibility();
    }

    _setupKeybindings() {
        const keybindings = [
            {
                name: 'cycle-output-forward',
                fn: () => this._cycleDevice(this._outputIndicator.chooser, 1),
            },
            {
                name: 'cycle-output-backward',
                fn: () => this._cycleDevice(this._outputIndicator.chooser, -1),
            },
            {
                name: 'cycle-input-forward',
                fn: () => this._cycleDevice(this._inputIndicator.chooser, 1),
            },
            {
                name: 'cycle-input-backward',
                fn: () => this._cycleDevice(this._inputIndicator.chooser, -1),
            },
        ];

        for (const {name, fn} of keybindings) {
            Main.wm.addKeybinding(
                name,
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL,
                fn
            );
        }
    }

    _cycleDevice(chooser, direction) {
        try {
            let device = chooser.cycleDevice(direction);
            if (device) {
                Main.osdWindowManager.show(-1,
                    null,
                    device.title,
                    null);
            }
        } catch (e) {
            console.error(`SDC: cycleDevice error: ${e}`);
        }
    }

    _setupInputSliderVisibility() {
        // In GNOME 45+ Quick Settings, input visibility is managed by the shell.
        // The show-input-slider setting is applied by making the input indicator
        // always visible when the setting is on, regardless of mic activity.
        // This is a best-effort approach since we don't monkey-patch shell internals.
        if (!this._settings.get_boolean(Port.SHOW_INPUT_SLIDER))
            return;

        try {
            let quickSettings = Main.panel.statusArea.quickSettings;
            if (quickSettings._volumeInput) {
                this._origInputVisibility =
                    quickSettings._volumeInput._shouldBeVisible?.bind(
                        quickSettings._volumeInput);
                quickSettings._volumeInput._shouldBeVisible = () => true;
                quickSettings._volumeInput._updateVisibility?.();
            }
        } catch (e) {
            // Non-critical — if this fails, the input slider just uses default visibility
            Port._log(`Could not override input slider visibility: ${e}`);
        }
    }

    _restoreInputSliderVisibility() {
        try {
            let quickSettings = Main.panel.statusArea.quickSettings;
            if (this._origInputVisibility && quickSettings._volumeInput) {
                quickSettings._volumeInput._shouldBeVisible = this._origInputVisibility;
                quickSettings._volumeInput._updateVisibility?.();
                this._origInputVisibility = null;
            }
        } catch (_e) {
            // Ignore cleanup errors
        }
    }

    disable() {
        // Remove keybindings
        Main.wm.removeKeybinding('cycle-output-forward');
        Main.wm.removeKeybinding('cycle-output-backward');
        Main.wm.removeKeybinding('cycle-input-forward');
        Main.wm.removeKeybinding('cycle-input-backward');

        // Restore input slider
        this._restoreInputSliderVisibility();

        // Destroy indicators
        this._outputIndicator?.destroy();
        this._outputIndicator = null;
        this._inputIndicator?.destroy();
        this._inputIndicator = null;
        this._appMixerIndicator?.destroy();
        this._appMixerIndicator = null;

        this._settings = null;
    }
}
