import {
    AUDIO_ASSETS,
    AUDIO_BUS_IDS,
    normalizeAudioManifest,
} from "./audioManifest.js";
import { AudioAssetLoader } from "./audioLoader.js";
import { resolveSoundState } from "./soundResolver.js";

const DEFAULT_BUS_VOLUMES = Object.freeze({
    environment: 1,
    train: 1,
    music: 0.8,
    voice: 1,
});

const clamp = (value, minimum = 0, maximum = 1) => {
    const number = Number(value);
    return Math.max(
        minimum,
        Math.min(maximum, Number.isFinite(number) ? number : minimum),
    );
};

function defaultAudioContextClass() {
    return globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null;
}

function defaultCanPlayType(type) {
    if (typeof document === "undefined") return "";
    return document.createElement("audio").canPlayType(type);
}

export function rampAudioParam(context, parameter, target, duration = 0.12) {
    if (!context || !parameter) return;
    const now = context.currentTime;
    const value = Number.isFinite(Number(parameter.value))
        ? Number(parameter.value)
        : Number(target);
    if (typeof parameter.cancelAndHoldAtTime === "function") {
        parameter.cancelAndHoldAtTime(now);
    } else {
        parameter.cancelScheduledValues?.(now);
        parameter.setValueAtTime?.(value, now);
    }
    if (duration <= 0) parameter.setValueAtTime?.(target, now);
    else parameter.linearRampToValueAtTime?.(target, now + duration);
}

export class SoundEngine {
    constructor({
        manifest = AUDIO_ASSETS,
        AudioContextClass = defaultAudioContextClass(),
        fetchFn = globalThis.fetch,
        canPlayType = defaultCanPlayType,
        onStateChange = () => {},
    } = {}) {
        this.manifest = normalizeAudioManifest(manifest);
        this.assets = new Map(this.manifest.map((asset) => [asset.id, asset]));
        this.AudioContextClass = AudioContextClass;
        this.fetchFn = fetchFn;
        this.canPlayType = canPlayType;
        this.onStateChange = onStateChange;

        this.state = "locked";
        this.context = null;
        this.loader = null;
        this.masterGain = null;
        this.compressor = null;
        this.buses = new Map();
        this.layers = new Map();
        this.pendingLayers = new Set();
        this.layerInstance = 0;
        this.unlockPromise = null;
        this.destroyed = false;
        this.muted = false;
        this.masterVolume = 0.8;
        this.busVolumes = { ...DEFAULT_BUS_VOLUMES };
        this.presentationPaused = false;
        this.hasWorldState = false;
        this.lastSnapshot = {};
        this.resolved = resolveSoundState(this.lastSnapshot);
    }

    setState(state) {
        if (this.state === state) return;
        this.state = state;
        this.onStateChange(state);
    }

    async unlock() {
        if (this.destroyed) throw new Error("The Sound Engine was destroyed.");
        if (this.state === "ready") return true;
        if (this.context && this.state === "suspended") {
            await this.context.resume();
            this.setState("ready");
            this.applyMix(0.08);
            return true;
        }
        if (this.unlockPromise) return this.unlockPromise;
        if (!this.AudioContextClass)
            throw new Error("Web Audio is unavailable in this browser.");

        this.unlockPromise = this.createAudioGraph();
        try {
            await this.unlockPromise;
            return true;
        } catch (error) {
            this.setState("error");
            throw error;
        } finally {
            this.unlockPromise = null;
        }
    }

    async createAudioGraph() {
        this.context = new this.AudioContextClass({ latencyHint: "interactive" });
        this.context.onstatechange = () => {
            if (this.destroyed || this.state === "locked") return;
            if (this.context.state === "running") this.setState("ready");
            else if (
                this.context.state === "suspended" ||
                this.context.state === "interrupted"
            )
                this.setState("suspended");
        };
        this.masterGain = this.context.createGain();
        this.compressor = this.context.createDynamicsCompressor();
        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.context.destination);

        const compressorValues = {
            threshold: -8,
            knee: 8,
            ratio: 5,
            attack: 0.006,
            release: 0.18,
        };
        for (const [key, value] of Object.entries(compressorValues))
            this.compressor[key]?.setValueAtTime?.(value, this.context.currentTime);

        for (const id of AUDIO_BUS_IDS) {
            const stateGain = this.context.createGain();
            const volumeGain = this.context.createGain();
            stateGain.gain.setValueAtTime(0, this.context.currentTime);
            volumeGain.gain.setValueAtTime(
                this.busVolumes[id],
                this.context.currentTime,
            );
            stateGain.connect(volumeGain);
            volumeGain.connect(this.masterGain);
            this.buses.set(id, { stateGain, volumeGain });
        }

        this.masterGain.gain.setValueAtTime(0, this.context.currentTime);
        this.loader = new AudioAssetLoader(this.context, {
            fetchFn: this.fetchFn,
            canPlayType: this.canPlayType,
        });
        await this.context.resume();
        this.setState("ready");
        this.applyMix(0.08);
        for (const asset of this.manifest.filter(({ preload }) => preload))
            this.loader.load(asset).catch((error) => {
                console.error(`Could not preload audio layer ${asset.id}:`, error);
            });
        await Promise.all(
            this.manifest
                .filter(({ autoplay }) => autoplay)
                .map(({ id }) =>
                    this.startLayer(id).catch((error) => {
                        console.error(`Could not start audio layer ${id}:`, error);
                    }),
                ),
        );
        this.ensureReactiveLayers();
    }

    setMasterVolume(value) {
        this.masterVolume = clamp(value);
        this.applyMasterGain();
        return this.masterVolume;
    }

    setMuted(muted) {
        this.muted = Boolean(muted);
        this.applyMasterGain();
        return this.muted;
    }

    setBusVolume(id, value) {
        if (!AUDIO_BUS_IDS.includes(id))
            throw new Error(`Unknown audio bus: ${id}`);
        this.busVolumes[id] = clamp(value);
        const bus = this.buses.get(id);
        if (bus)
            rampAudioParam(
                this.context,
                bus.volumeGain.gain,
                this.busVolumes[id],
                0.1,
            );
        return this.busVolumes[id];
    }

    applyMasterGain(duration = 0.1) {
        if (!this.context || !this.masterGain) return;
        rampAudioParam(
            this.context,
            this.masterGain.gain,
            this.muted ? 0 : this.masterVolume,
            duration,
        );
    }

    updateWorldState(snapshot) {
        const previousTravelRunning = this.resolved.world.travelRunning;
        const hadWorldState = this.hasWorldState;
        this.lastSnapshot = snapshot ?? {};
        this.resolved = resolveSoundState(this.lastSnapshot, {
            presentationPaused: this.presentationPaused,
        });
        this.hasWorldState = true;
        this.applyMix();
        this.ensureReactiveLayers();
        if (
            hadWorldState &&
            previousTravelRunning !== this.resolved.world.travelRunning &&
            this.state === "ready"
        ) {
            this.playTrigger(
                this.resolved.world.travelRunning ? "train-start" : "train-stop",
            );
        }
        return this.resolved;
    }

    setPresentationPaused(paused) {
        this.presentationPaused = Boolean(paused);
        return this.updateWorldState(this.lastSnapshot);
    }

    applyMix(duration = 0.16) {
        if (!this.context || this.state !== "ready") return;
        this.applyMasterGain(duration);
        for (const [id, target] of Object.entries(this.resolved.buses)) {
            const bus = this.buses.get(id);
            if (bus)
                rampAudioParam(
                    this.context,
                    bus.stateGain.gain,
                    target,
                    duration,
                );
        }
        for (const layer of this.layers.values()) this.applyLayerTarget(layer);
    }

    async startLayer(id, { fade = 0.35 } = {}) {
        if (this.state !== "ready" || !this.loader)
            throw new Error("Enable the Sound Engine before starting a layer.");
        if (this.layers.has(id)) return this.layers.get(id);
        const asset = this.assets.get(id);
        if (!asset) throw new Error(`Unknown audio asset: ${id}`);
        if (!asset.loop) return this.playOneShot(id);

        const buffer = await this.loader.load(asset);
        if (this.destroyed || this.state !== "ready") return null;
        if (this.layers.has(id)) return this.layers.get(id);

        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        source.buffer = buffer;
        source.loop = asset.loop;
        if (asset.loopStart > 0) source.loopStart = asset.loopStart;
        if (asset.loopEnd > 0) source.loopEnd = asset.loopEnd;
        gain.gain.setValueAtTime(0, this.context.currentTime);
        source.connect(gain);
        gain.connect(this.buses.get(asset.bus).stateGain);

        const layer = { asset, source, gain, fade, stopped: false };
        this.layers.set(id, layer);
        source.onended = () => {
            if (this.layers.get(id) === layer) this.layers.delete(id);
            source.disconnect?.();
            gain.disconnect?.();
        };
        source.start();
        this.applyLayerTarget(layer);
        return layer;
    }

    ensureReactiveLayers() {
        if (this.state !== "ready") return;
        for (const asset of this.manifest) {
            if (!asset.reactive) continue;
            const target = this.resolved.layers[asset.role] ?? 0;
            if (
                target <= 0.015 ||
                this.layers.has(asset.id) ||
                this.pendingLayers.has(asset.id)
            )
                continue;
            this.pendingLayers.add(asset.id);
            this.startLayer(asset.id)
                .catch((error) => {
                    console.error(`Could not start audio layer ${asset.id}:`, error);
                })
                .finally(() => this.pendingLayers.delete(asset.id));
        }
    }

    playTrigger(trigger) {
        for (const [key, layer] of this.layers) {
            if (layer.asset.trigger && layer.asset.trigger !== trigger)
                this.stopLayer(key, { fade: 0.12 });
        }
        for (const asset of this.manifest) {
            if (asset.trigger === trigger)
                this.playOneShot(asset.id).catch((error) => {
                    console.error(`Could not play audio cue ${asset.id}:`, error);
                });
        }
    }

    async playOneShot(id) {
        if (this.state !== "ready" || !this.loader)
            throw new Error("Enable the Sound Engine before playing a cue.");
        const asset = this.assets.get(id);
        if (!asset) throw new Error(`Unknown audio asset: ${id}`);

        const buffer = await this.loader.load(asset);
        if (this.destroyed || this.state !== "ready") return null;
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        const key = `${id}#${++this.layerInstance}`;
        source.buffer = buffer;
        source.loop = false;
        const roleGain = this.resolved.layers[asset.role] ?? 1;
        gain.gain.setValueAtTime(
            asset.gain * roleGain,
            this.context.currentTime,
        );
        source.connect(gain);
        gain.connect(this.buses.get(asset.bus).stateGain);

        const layer = {
            key,
            asset,
            source,
            gain,
            fade: 0.06,
            stopped: false,
        };
        this.layers.set(key, layer);
        source.onended = () => {
            if (this.layers.get(key) === layer) this.layers.delete(key);
            source.disconnect?.();
            gain.disconnect?.();
        };
        source.start();
        return layer;
    }

    applyLayerTarget(layer) {
        const { asset, source, gain, fade } = layer;
        const roleGain = this.resolved.layers[asset.role] ?? 1;
        rampAudioParam(
            this.context,
            gain.gain,
            asset.gain * roleGain,
            fade,
        );
        const playbackRate = this.resolved.playbackRates[asset.role];
        if (playbackRate && source.playbackRate)
            rampAudioParam(this.context, source.playbackRate, playbackRate, 0.2);
    }

    stopLayer(id, { fade = 0.25 } = {}) {
        const layer = this.layers.get(id);
        if (!layer || layer.stopped) return false;
        layer.stopped = true;
        rampAudioParam(this.context, layer.gain.gain, 0, fade);
        try {
            layer.source.stop(this.context.currentTime + Math.max(0, fade));
        } catch {
            // A source may already have naturally ended between state updates.
        }
        return true;
    }

    async setPageHidden(hidden) {
        if (!this.context || this.state === "locked" || this.destroyed) return;
        if (hidden) {
            await this.context.suspend();
            this.setState("suspended");
        } else {
            await this.context.resume();
            this.setState("ready");
            this.applyMix(0.12);
        }
    }

    async suspend() {
        if (!this.context || this.destroyed) return;
        await this.context.suspend();
        this.setState("suspended");
    }

    getState() {
        return Object.freeze({
            state: this.state,
            muted: this.muted,
            masterVolume: this.masterVolume,
            busVolumes: Object.freeze({ ...this.busVolumes }),
            activeLayers: Object.freeze([...this.layers.keys()]),
            resolved: this.resolved,
        });
    }

    async destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const id of [...this.layers.keys()]) this.stopLayer(id, { fade: 0 });
        this.loader?.clear();
        this.pendingLayers.clear();
        for (const { stateGain, volumeGain } of this.buses.values()) {
            stateGain.disconnect?.();
            volumeGain.disconnect?.();
        }
        this.masterGain?.disconnect?.();
        this.compressor?.disconnect?.();
        if (this.context && this.context.state !== "closed")
            await this.context.close();
        this.buses.clear();
        this.setState("destroyed");
    }
}
