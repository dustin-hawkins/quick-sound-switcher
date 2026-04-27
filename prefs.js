/*
 * Sound Input & Output Device Chooser
 * Preferences UI using Adw widgets for GNOME 45-50.
 *
 * Original Author: Gopi Sankar Karmegam
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DISPLAY_OPTIONS = {SHOW_ALWAYS: 1, HIDE_ALWAYS: 2, DEFAULT: 3};
const PORT_SETTINGS_VERSION = 3;

export default class SDCPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // --- General Page ---
        const generalPage = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(generalPage);

        // Display group
        const displayGroup = new Adw.PreferencesGroup({
            title: _('Display'),
        });
        generalPage.add(displayGroup);

        this._addSwitchRow(displayGroup, settings, 'hide-on-single-device',
            _('Hide on Single Device'),
            _('Hide the device chooser when only one device is available'));

        this._addIconThemeRow(displayGroup, settings);

        this._addSwitchRow(displayGroup, settings, 'omit-device-origins',
            _('Omit Device Origins'),
            _('Hide device origin text from display names'));

        this._addSwitchRow(displayGroup, settings, 'show-profiles',
            _('Show Audio Profiles'),
            _('Display available audio profiles for each device'));

        // Output group
        const outputGroup = new Adw.PreferencesGroup({
            title: _('Output Devices'),
        });
        generalPage.add(outputGroup);

        this._addSwitchRow(outputGroup, settings, 'show-output-devices',
            _('Show Output Device Chooser'),
            _('Display the output device selector in Quick Settings'));

        // Input group
        const inputGroup = new Adw.PreferencesGroup({
            title: _('Input Devices'),
        });
        generalPage.add(inputGroup);

        this._addSwitchRow(inputGroup, settings, 'show-input-devices',
            _('Show Input Device Chooser'),
            _('Display the input device selector in Quick Settings'));

        this._addSwitchRow(inputGroup, settings, 'show-input-slider',
            _('Always Show Input Slider'),
            _('Show the microphone volume slider even when no mic is active'));

        // Behavior group
        const behaviorGroup = new Adw.PreferencesGroup({
            title: _('Behavior'),
        });
        generalPage.add(behaviorGroup);

        this._addSwitchRow(behaviorGroup, settings, 'cannot-activate-hidden-device',
            _('Block Hidden Device Activation'),
            _('Prevent hidden devices from being activated automatically'));

        this._addSwitchRow(behaviorGroup, settings, 'new-profile-identification',
            _('Use Python for Profile Detection'),
            _('Use Python script for more accurate port profile identification'));

        // Debug group
        const debugGroup = new Adw.PreferencesGroup({
            title: _('Debug'),
        });
        generalPage.add(debugGroup);

        this._addSwitchRow(debugGroup, settings, 'enable-log',
            _('Enable Debug Logging'),
            _('Write debug messages to the system journal'));

        // --- Port Settings Page ---
        const portsPage = new Adw.PreferencesPage({
            title: _('Port Visibility'),
            icon_name: 'audio-card-symbolic',
        });
        window.add(portsPage);

        const portsGroup = new Adw.PreferencesGroup({
            title: _('Audio Ports'),
            description: _('Control which audio ports are shown, hidden, or use default visibility'),
        });
        portsPage.add(portsGroup);

        this._populatePortSettings(portsGroup, settings);

        // --- Keyboard Shortcuts Page ---
        const shortcutsPage = new Adw.PreferencesPage({
            title: _('Shortcuts'),
            icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic',
        });
        window.add(shortcutsPage);

        const shortcutsGroup = new Adw.PreferencesGroup({
            title: _('Device Cycling Shortcuts'),
            description: _('Keyboard shortcuts for cycling through devices. Edit via dconf-editor or gsettings.'),
        });
        shortcutsPage.add(shortcutsGroup);

        this._addShortcutRow(shortcutsGroup, settings, 'cycle-output-forward',
            _('Cycle Output Forward'));
        this._addShortcutRow(shortcutsGroup, settings, 'cycle-output-backward',
            _('Cycle Output Backward'));
        this._addShortcutRow(shortcutsGroup, settings, 'cycle-input-forward',
            _('Cycle Input Forward'));
        this._addShortcutRow(shortcutsGroup, settings, 'cycle-input-backward',
            _('Cycle Input Backward'));
    }

    _addSwitchRow(group, settings, key, title, subtitle) {
        const row = new Adw.SwitchRow({
            title,
            subtitle: subtitle || '',
        });
        group.add(row);
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _addIconThemeRow(group, settings) {
        const row = new Adw.ComboRow({
            title: _('Icon Theme'),
            subtitle: _('Style of icons in the device list'),
        });

        const model = new Gtk.StringList();
        model.append(_('Monochrome'));
        model.append(_('Colored'));
        model.append(_('None'));
        row.model = model;

        const values = ['monochrome', 'colored', 'none'];
        let current = settings.get_string('icon-theme');
        let idx = values.indexOf(current);
        if (idx >= 0)
            row.selected = idx;

        row.connect('notify::selected', () => {
            settings.set_string('icon-theme', values[row.selected]);
        });

        settings.connect('changed::icon-theme', () => {
            let newIdx = values.indexOf(settings.get_string('icon-theme'));
            if (newIdx >= 0 && newIdx !== row.selected)
                row.selected = newIdx;
        });

        group.add(row);
    }

    _addShortcutRow(group, settings, key, title) {
        let shortcuts = settings.get_strv(key);
        let label = shortcuts.length > 0 ? shortcuts[0] : _('(unset)');

        const row = new Adw.ActionRow({
            title,
            subtitle: label,
        });

        group.add(row);
    }

    _populatePortSettings(group, settings) {
        let ports = this._scanPorts(settings);
        let savedPorts = this._getPortsFromSettings(settings);

        ports.sort((a, b) =>
            b.direction.localeCompare(a.direction) ||
            this._portDisplayName(a).localeCompare(this._portDisplayName(b)));

        if (ports.length === 0) {
            const emptyRow = new Adw.ActionRow({
                title: _('No audio ports detected'),
                subtitle: _('Ensure PulseAudio or PipeWire is running'),
            });
            group.add(emptyRow);
            return;
        }

        for (let port of ports) {
            let displayName = this._portDisplayName(port);
            let savedPort = savedPorts.find(p =>
                p && p.name === port.name &&
                p.human_name === port.human_name &&
                p.card_name === port.card_name);

            let currentOption = savedPort
                ? savedPort.display_option
                : DISPLAY_OPTIONS.DEFAULT;

            const row = new Adw.ComboRow({
                title: displayName,
                subtitle: port.direction || '',
            });

            const model = new Gtk.StringList();
            model.append(_('Default'));
            model.append(_('Show Always'));
            model.append(_('Hide Always'));
            row.model = model;

            const optionToIndex = {
                [DISPLAY_OPTIONS.DEFAULT]: 0,
                [DISPLAY_OPTIONS.SHOW_ALWAYS]: 1,
                [DISPLAY_OPTIONS.HIDE_ALWAYS]: 2,
            };
            const indexToOption = [
                DISPLAY_OPTIONS.DEFAULT,
                DISPLAY_OPTIONS.SHOW_ALWAYS,
                DISPLAY_OPTIONS.HIDE_ALWAYS,
            ];

            row.selected = optionToIndex[currentOption] ?? 0;

            row._portData = {
                human_name: port.human_name,
                name: port.name,
                card_name: port.card_name,
                card_description: port.card_description,
                display_name: displayName,
                direction: port.direction,
            };

            row.connect('notify::selected', () => {
                this._commitPortSettings(group, settings, indexToOption);
            });

            group.add(row);
        }
    }

    _portDisplayName(port) {
        return `${port.human_name} - ${port.card_description}`;
    }

    _commitPortSettings(group, settings, indexToOption) {
        let ports = [];
        let child = group.get_first_child();
        while (child) {
            if (child instanceof Adw.ComboRow && child._portData) {
                let option = indexToOption[child.selected];
                if (option !== DISPLAY_OPTIONS.DEFAULT) {
                    ports.push({
                        human_name: child._portData.human_name,
                        name: child._portData.name,
                        display_option: option,
                        card_name: child._portData.card_name,
                        card_description: child._portData.card_description,
                        display_name: child._portData.display_name,
                    });
                }
            }
            child = child.get_next_sibling();
        }

        let settingsObj = {version: PORT_SETTINGS_VERSION, ports};
        settings.set_string('ports-settings', JSON.stringify(settingsObj));
    }

    _getPortsFromSettings(settings) {
        try {
            let obj = JSON.parse(settings.get_string('ports-settings'));
            return Array.isArray(obj) ? obj : (obj.ports || []);
        } catch (_e) {
            return [];
        }
    }

    _scanPorts(settings) {
        let usePython = settings.get_boolean('new-profile-identification');

        if (usePython) {
            let pyLocation = this.dir.get_child('utils/pa_helper.py').get_path();
            try {
                let [result, out, , exitCode] = GLib.spawn_command_line_sync(
                    `python3 ${pyLocation}`);
                if (result && !exitCode) {
                    let decoded = new TextDecoder().decode(out);
                    let obj = JSON.parse(decoded);
                    return obj.ports || [];
                }
            } catch (_e) {
                // Fall through to pactl
            }
        }

        try {
            let env = GLib.get_environ();
            env = GLib.environ_setenv(env, 'LANG', 'C', true);
            let [result, out] = GLib.spawn_sync(
                null, ['pactl', 'list', 'cards'], env,
                GLib.SpawnFlags.SEARCH_PATH, null);
            if (result)
                return this._parsePactlPorts(out);
        } catch (_e) {
            // No ports
        }
        return [];
    }

    _parsePactlPorts(out) {
        let lines = new TextDecoder().decode(out).split('\n');
        let cards = {};
        let ports = [];
        let cardIndex;
        let parseSection = 'CARDS';
        let port;
        let matches;

        while (lines.length > 0) {
            let line = lines.shift();

            if ((matches = /^Card\s#(\d+)$/.exec(line))) {
                cardIndex = matches[1];
                if (!cards[cardIndex])
                    cards[cardIndex] = {index: cardIndex, profiles: [], ports: []};
            } else if ((matches = /^\t*Name:\s+(.*?)$/.exec(line)) && cards[cardIndex]) {
                cards[cardIndex].name = matches[1];
                parseSection = 'CARDS';
            } else if (line.match(/^\tProperties:$/) && parseSection === 'CARDS') {
                parseSection = 'PROPS';
            } else if (line.match(/^\t*Profiles:$/)) {
                parseSection = 'PROFILES';
            } else if (line.match(/^\t*Ports:$/)) {
                parseSection = 'PORTS';
            } else if (cards[cardIndex]) {
                switch (parseSection) {
                case 'PROPS':
                    if ((matches = /device\.description\s+=\s+"(.*?)"/.exec(line)))
                        cards[cardIndex].card_description = matches[1];
                    break;
                case 'PORTS':
                    if ((matches = /\t*(.*?):\s(.*)\s\(.*?priority:/.exec(line))) {
                        port = {
                            name: matches[1],
                            human_name: matches[2],
                            card_name: cards[cardIndex].name,
                            card_description: cards[cardIndex].card_description,
                        };
                        cards[cardIndex].ports.push(port);
                        ports.push(port);
                    } else if (port && (matches = /\t*Part of profile\(s\):\s(.*)/.exec(line))) {
                        port.profiles = matches[1].split(', ');
                        port = null;
                    }
                    break;
                }
            }
        }

        ports.forEach(p => {
            if (p.profiles) {
                p.direction = p.profiles
                    .filter(pr => !pr.includes('+input:'))
                    .some(pr => pr.includes('output:')) ? 'Output' : 'Input';
            } else {
                p.direction = '';
            }
        });

        return ports;
    }
}
