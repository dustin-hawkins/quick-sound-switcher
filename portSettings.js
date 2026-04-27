/*
 * Port settings, constants, and card/port scanning utilities.
 * ESM port of settings logic from prefs.js and convenience.js.
 *
 * Original Author: Gopi Sankar Karmegam
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import GLib from 'gi://GLib';

// Settings key constants
export const HIDE_ON_SINGLE_DEVICE = 'hide-on-single-device';
export const SHOW_PROFILES = 'show-profiles';
export const PORT_SETTINGS = 'ports-settings';
export const SHOW_INPUT_SLIDER = 'show-input-slider';
export const SHOW_INPUT_DEVICES = 'show-input-devices';
export const SHOW_OUTPUT_DEVICES = 'show-output-devices';
export const ENABLE_LOG = 'enable-log';
export const NEW_PROFILE_ID = 'new-profile-identification';
export const CANNOT_ACTIVATE_HIDDEN_DEVICE = 'cannot-activate-hidden-device';
export const OMIT_DEVICE_ORIGIN = 'omit-device-origins';
export const ICON_THEME = 'icon-theme';
export const ICON_THEME_COLORED = 'colored';
export const ICON_THEME_MONOCHROME = 'monochrome';
export const ICON_THEME_NONE = 'none';

export const DISPLAY_OPTIONS = {SHOW_ALWAYS: 1, HIDE_ALWAYS: 2, DEFAULT: 3, INITIAL: -1};

const PORT_SETTINGS_VERSION = 3;

// Debug logging
let _debug = false;

export function setLog(value) {
    _debug = value;
}

export function _log(msg) {
    if (_debug)
        console.log(`SDC: ${msg}`);
}

// --- Port Settings ---

export function getPortsFromSettings(settings) {
    try {
        let obj = JSON.parse(settings.get_string(PORT_SETTINGS));
        let currentVersion = Array.isArray(obj) ? 1 : obj.version;
        if (currentVersion < PORT_SETTINGS_VERSION)
            obj = migratePortSettings(currentVersion, obj, settings);
        return obj.ports;
    } catch (e) {
        _log(`Could not parse port settings, returning empty: ${e}`);
        return [];
    }
}

export function setPortsSettings(ports, settings) {
    let settingsObj = {version: PORT_SETTINGS_VERSION, ports};
    settings.set_string(PORT_SETTINGS, JSON.stringify(settingsObj));
    return settingsObj;
}

export function getPortDisplayName(port) {
    return `${port.human_name} - ${port.card_description}`;
}

function migratePortSettings(currVersion, currSettings, settings) {
    let ports = [];
    let livePorts = getPorts(true).slice();
    switch (currVersion) {
    case 1:
        for (let port of currSettings) {
            for (let i = 0; i < livePorts.length; i++) {
                let lp = livePorts[i];
                if (port.human_name === lp.human_name && port.name === lp.name) {
                    port.card_name = lp.card_name;
                    port.card_description = lp.card_description;
                    port.display_name = getPortDisplayName(lp);
                    livePorts.splice(i, 1);
                    ports.push(port);
                    break;
                }
            }
        }
        break;
    case 2:
        for (let port of currSettings.ports) {
            for (let i = 0; i < livePorts.length; i++) {
                let lp = livePorts[i];
                if (port.human_name === lp.human_name && port.name === lp.name && port.card_name === lp.card_name) {
                    port.card_description = lp.card_description;
                    livePorts.splice(i, 1);
                    ports.push(port);
                    break;
                }
            }
        }
        break;
    }
    return setPortsSettings(ports, settings);
}

// --- Card / Port Scanning ---

let _cards = {};
let _ports = [];

export function getCard(cardIndex) {
    if (!_cards || Object.keys(_cards).length === 0)
        refreshCards();
    // Card keys are strings from regex parsing; cardIndex from Gvc is a number
    return _cards[String(cardIndex)];
}

export function getPorts(refresh) {
    if (!_ports || _ports.length === 0 || refresh)
        refreshCards();
    return _ports;
}

export function getSinks() {
    try {
        let [, out] = GLib.spawn_command_line_sync('pactl list sinks');
        let input = new TextDecoder().decode(out);
        const regex = /Sink #(\d+)\n(?:.|\n)*?device\.description = "(.*?)"(?:.|\n)*?/g;
        let matches;
        let sinks = [];
        while ((matches = regex.exec(input)) !== null)
            sinks.push({id: matches[1], name: matches[2]});
        return sinks;
    } catch (e) {
        _log(`ERROR getting sinks: ${e}`);
        return [];
    }
}

export function refreshCards(extensionDir, settings) {
    _cards = {};
    _ports = [];

    let usePython = settings ? settings.get_boolean(NEW_PROFILE_ID) : false;

    if (usePython && extensionDir) {
        let pyLocation = extensionDir.get_child('utils/pa_helper.py').get_path();
        let pythonExec = ['python3', 'python'].find(
            cmd => GLib.find_program_in_path(cmd) !== null);
        if (pythonExec) {
            try {
                let [result, out, , exitCode] = GLib.spawn_command_line_sync(
                    `${pythonExec} ${pyLocation}`);
                if (result && !exitCode) {
                    let decoded = new TextDecoder().decode(out);
                    let obj = JSON.parse(decoded);
                    _cards = obj.cards;
                    _ports = obj.ports;
                    return;
                }
            } catch (e) {
                _log(`Python execution failed, falling back to pactl: ${e}`);
            }
        }
    }

    // Fallback: parse pactl output
    try {
        let env = GLib.get_environ();
        env = GLib.environ_setenv(env, 'LANG', 'C', true);
        let [result, out] = GLib.spawn_sync(
            null, ['pactl', 'list', 'cards'], env,
            GLib.SpawnFlags.SEARCH_PATH, null);
        if (result)
            _parseCardOutput(out);
    } catch (e) {
        _log(`ERROR: pactl execution failed: ${e}`);
    }
}

export function getProfiles(control, uidevice) {
    let stream = control.lookup_stream_id(uidevice.get_stream_id());
    if (stream) {
        let cardKey = String(stream.card_index);
        if (!_cards || Object.keys(_cards).length === 0 || !_cards[cardKey])
            refreshCards();
        if (_cards && _cards[cardKey]) {
            let profiles = _getProfilesForPort(uidevice.port_name, _cards[cardKey]);
            if (profiles)
                return profiles;
        }
    } else {
        refreshCards();
        for (let card of Object.values(_cards)) {
            let profiles = _getProfilesForPort(uidevice.port_name, card);
            if (profiles)
                return profiles;
        }
    }
    return [];
}

function _getProfilesForPort(portName, card) {
    if (!card.ports)
        return null;
    let port = card.ports.find(p => portName === p.name);
    if (port && port.profiles) {
        return card.profiles.filter(profile =>
            !profile.name.includes('+input:') &&
            profile.available === 1 &&
            port.profiles.includes(profile.name)
        );
    }
    return null;
}

function _parseCardOutput(out) {
    let lines = new TextDecoder().decode(out).split('\n');
    let cardIndex;
    let parseSection = 'CARDS';
    let port;
    let matches;

    while (lines.length > 0) {
        let line = lines.shift();

        if ((matches = /^Card\s#(\d+)$/.exec(line))) {
            cardIndex = matches[1];
            if (!_cards[cardIndex])
                _cards[cardIndex] = {index: cardIndex, profiles: [], ports: []};
        } else if ((matches = /^\t*Name:\s+(.*?)$/.exec(line)) && _cards[cardIndex]) {
            _cards[cardIndex].name = matches[1];
            parseSection = 'CARDS';
        } else if (line.match(/^\tProperties:$/) && parseSection === 'CARDS') {
            parseSection = 'PROPS';
        } else if (line.match(/^\t*Profiles:$/)) {
            parseSection = 'PROFILES';
        } else if (line.match(/^\t*Ports:$/)) {
            parseSection = 'PORTS';
        } else if (_cards[cardIndex]) {
            switch (parseSection) {
            case 'PROPS':
                if ((matches = /alsa\.card_name\s+=\s+"(.*?)"/.exec(line)))
                    _cards[cardIndex].alsa_name = matches[1];
                else if ((matches = /device\.description\s+=\s+"(.*?)"/.exec(line)))
                    _cards[cardIndex].card_description = matches[1];
                break;
            case 'PROFILES':
                if ((matches = /.*?((?:output|input)[^+]*?):\s(.*?)\s\(sinks:.*?(?:available:\s*(.*?))*\)/.exec(line))) {
                    let availability = matches[3] ? matches[3] : 'yes';
                    _cards[cardIndex].profiles.push({
                        name: matches[1],
                        human_name: matches[2],
                        available: availability === 'yes' ? 1 : 0,
                    });
                }
                break;
            case 'PORTS':
                if ((matches = /\t*(.*?):\s(.*)\s\(.*?priority:/.exec(line))) {
                    port = {
                        name: matches[1],
                        human_name: matches[2],
                        card_name: _cards[cardIndex].name,
                        card_description: _cards[cardIndex].card_description,
                    };
                    _cards[cardIndex].ports.push(port);
                    _ports.push(port);
                } else if (port && (matches = /\t*Part of profile\(s\):\s(.*)/.exec(line))) {
                    port.profiles = matches[1].split(', ');
                    port = null;
                }
                break;
            }
        }
    }
    if (_ports) {
        _ports.forEach(p => {
            p.direction = p.profiles
                .filter(pr => !pr.includes('+input:'))
                .some(pr => pr.includes('output:')) ? 'Output' : 'Input';
        });
    }
}
