/*
 * Signal tracking and cleanup for GNOME Shell extensions.
 * ESM port of SignalManager from convenience.js.
 *
 * Original Author: Gopi Sankar Karmegam
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

class Signal {
    constructor(signalSource, signalName, callback) {
        this._signalSource = signalSource;
        this._signalName = signalName;
        this._signalCallback = callback;
    }

    connect() {
        this._signalId = this._signalSource.connect(this._signalName, this._signalCallback);
    }

    disconnect() {
        if (this._signalId) {
            this._signalSource.disconnect(this._signalId);
            this._signalId = null;
        }
    }
}

export class SignalManager {
    constructor() {
        this._signalsBySource = new Map();
    }

    addSignal(signalSource, signalName, callback) {
        let signal = null;
        if (signalSource && signalName && callback) {
            signal = new Signal(signalSource, signalName, callback);
            signal.connect();
            if (!this._signalsBySource.has(signalSource)) {
                this._signalsBySource.set(signalSource, []);
            }
            this._signalsBySource.get(signalSource).push(signal);
        }
        return signal;
    }

    disconnectAll() {
        this._signalsBySource.forEach(signals => this._disconnectSignals(signals));
        this._signalsBySource.clear();
    }

    disconnectBySource(signalSource) {
        if (this._signalsBySource.has(signalSource)) {
            this._disconnectSignals(this._signalsBySource.get(signalSource));
            this._signalsBySource.delete(signalSource);
        }
    }

    _disconnectSignals(signals) {
        while (signals.length) {
            let signal = signals.shift();
            signal.disconnect();
        }
    }
}
