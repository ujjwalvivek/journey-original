import {
    AUDIO_ASSETS,
    AUDIO_BUS_IDS,
    normalizeAudioManifest,
} from "./audioManifest.js";
import { AudioAssetLoader, selectPlayableSource } from "./audioLoader.js";
import { resolveSoundState } from "./soundResolver.js";

const DEFAULT_BUS_VOLUMES = Object.freeze({
    environment: 1,
    train: 1,
    music: 1,
    voice: 1,
});

export const MASTER_DYNAMICS = Object.freeze({
    threshold: -3.5,
    knee: 5,
    ratio: 2.5,
    attack: 0.012,
    release: 0.28,
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

function defaultCreateMediaElement() {
    return typeof globalThis.Audio === "function" ? new globalThis.Audio() : null;
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

export function resolveCueAmbienceGain(envelope, now) {
    if (!envelope) return 1;
    const floor = envelope.ambienceFloor ?? envelope.floor ?? 1;
    const elapsed = Math.max(0, Number(now) - envelope.startedAt);
    if (elapsed >= envelope.duration) return 1;
    if (envelope.fadeIn > 0 && elapsed < envelope.fadeIn) {
        const progress = elapsed / envelope.fadeIn;
        return 1 + (floor - 1) * progress;
    }
    const fadeOutStart = Math.max(envelope.fadeIn, envelope.duration - envelope.fadeOut);
    if (envelope.fadeOut > 0 && elapsed > fadeOutStart) {
        const progress = (elapsed - fadeOutStart) / envelope.fadeOut;
        return floor + (1 - floor) * Math.min(1, progress);
    }
    return floor;
}

export function resolveCueMusicGain(envelope, now) {
    if (!envelope) return 1;
    return resolveCueAmbienceGain(
        { ...envelope, ambienceFloor: envelope.musicFloor ?? 1 },
        now,
    );
}

export class SoundEngine {
    constructor({
        manifest = AUDIO_ASSETS,
        AudioContextClass = defaultAudioContextClass(),
        fetchFn = globalThis.fetch,
        canPlayType = defaultCanPlayType,
        createMediaElement = defaultCreateMediaElement,
        onStateChange = () => {},
        onLayerError = () => {},
    } = {}) {
        this.manifest = normalizeAudioManifest(manifest);
        this.assets = new Map(this.manifest.map((asset) => [asset.id, asset]));
        this.AudioContextClass = AudioContextClass;
        this.fetchFn = fetchFn;
        this.canPlayType = canPlayType;
        this.createMediaElement = createMediaElement;
        this.onStateChange = onStateChange;
        this.onLayerError = onLayerError;

        this.state = "locked";
        this.context = null;
        this.loader = null;
        this.masterGain = null;
        this.compressor = null;
        this.buses = new Map();
        this.layers = new Map();
        this.pendingLayers = new Map();
        this.failedAssets = new Map();
        this.recordingOutputs = new Set();
        this.lastTriggerAt = new Map();
        this.manualAuditionToken = 0;
        this.layerInstance = 0;
        this.unlockPromise = null;
        this.destroyed = false;
        this.muted = false;
        this.masterVolume = 0.8;
        this.busVolumes = { ...DEFAULT_BUS_VOLUMES };
        this.busMuted = Object.fromEntries(
            AUDIO_BUS_IDS.map((id) => [id, false]),
        );
        this.soloBus = "";
        this.presentationPaused = false;
        this.ambienceCueEnvelope = null;
        this.hasWorldState = false;
        this.lastSnapshot = {};
        this.resolved = resolveSoundState(this.lastSnapshot, {
            musicLevel: this.busVolumes.music,
        });
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

        for (const [key, value] of Object.entries(MASTER_DYNAMICS))
            this.compressor[key]?.setValueAtTime?.(value, this.context.currentTime);

        for (const id of AUDIO_BUS_IDS) {
            const stateGain = this.context.createGain();
            const volumeGain = this.context.createGain();
            const filter =
                id === "environment" && this.context.createBiquadFilter
                    ? this.context.createBiquadFilter()
                    : null;
            stateGain.gain.setValueAtTime(0, this.context.currentTime);
            volumeGain.gain.setValueAtTime(
                this.resolveBusOutput(id),
                this.context.currentTime,
            );
            if (filter) {
                filter.type = "lowpass";
                filter.frequency.setValueAtTime(18000, this.context.currentTime);
                filter.Q.setValueAtTime(0.35, this.context.currentTime);
                stateGain.connect(filter);
                filter.connect(volumeGain);
            } else {
                stateGain.connect(volumeGain);
            }
            volumeGain.connect(this.masterGain);
            this.buses.set(id, { stateGain, volumeGain, filter });
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
                this.reportLayerError(asset, error);
            });
        await Promise.all(
            this.manifest
                .filter(({ autoplay }) => autoplay)
                .map(({ id }) =>
                    this.startLayer(id).catch((error) => {
                        this.reportLayerError(this.assets.get(id), error);
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

    createRecordingOutput() {
        if (this.state !== "ready" || !this.context || !this.compressor)
            throw new Error("Enable the Sound Engine before recording.");
        if (!this.context.createMediaStreamDestination)
            throw new Error("Audio stream recording is unavailable in this browser.");

        const destination = this.context.createMediaStreamDestination();
        this.compressor.connect(destination);
        let released = false;
        const output = {
            stream: destination.stream,
            release: () => {
                if (released) return;
                released = true;
                try {
                    this.compressor?.disconnect(destination);
                } catch {
                    // The graph may already be disconnected during teardown.
                }
                this.recordingOutputs.delete(output);
            },
        };
        this.recordingOutputs.add(output);
        return output;
    }

    setBusVolume(id, value) {
        if (!AUDIO_BUS_IDS.includes(id))
            throw new Error(`Unknown audio bus: ${id}`);
        this.busVolumes[id] = clamp(value);
        this.applyBusOutput(id);
        if (id === "music") this.refreshResolvedMix();
        return this.busVolumes[id];
    }

    resolveBusOutput(id) {
        if (this.busMuted[id]) return 0;
        if (this.soloBus && this.soloBus !== id) return 0;
        return this.busVolumes[id];
    }

    applyBusOutput(id, duration = 0.1) {
        const bus = this.buses.get(id);
        if (bus)
            rampAudioParam(
                this.context,
                bus.volumeGain.gain,
                this.resolveBusOutput(id),
                duration,
            );
    }

    refreshResolvedMix() {
        this.resolved = resolveSoundState(this.lastSnapshot, {
            presentationPaused: this.presentationPaused,
            musicLevel: this.resolveBusOutput("music"),
        });
        this.applyMix();
        this.ensureReactiveLayers();
    }

    setBusMuted(id, muted) {
        if (!AUDIO_BUS_IDS.includes(id))
            throw new Error(`Unknown audio bus: ${id}`);
        this.busMuted[id] = Boolean(muted);
        this.applyBusOutput(id);
        if (id === "music") this.refreshResolvedMix();
        return this.busMuted[id];
    }

    setSoloBus(id = "") {
        if (id && !AUDIO_BUS_IDS.includes(id))
            throw new Error(`Unknown audio bus: ${id}`);
        this.soloBus = id;
        for (const busId of AUDIO_BUS_IDS) this.applyBusOutput(busId);
        this.refreshResolvedMix();
        return this.soloBus;
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
        const previousWeatherId = this.resolved.world.weatherId;
        const previousJourneyTime = this.resolved.world.journeyTime;
        const hadWorldState = this.hasWorldState;
        this.lastSnapshot = snapshot ?? {};
        this.resolved = resolveSoundState(this.lastSnapshot, {
            presentationPaused: this.presentationPaused,
            musicLevel: this.resolveBusOutput("music"),
        });
        this.hasWorldState = true;
        const journeyRestarted =
            hadWorldState &&
            this.resolved.world.journeyTime < previousJourneyTime - 0.25;
        if (journeyRestarted) this.resetAudioTimeline();
        if (
            !journeyRestarted &&
            hadWorldState &&
            previousTravelRunning !== this.resolved.world.travelRunning &&
            this.state === "ready"
        ) {
            this.playTrigger(
                this.resolved.world.travelRunning ? "train-start" : "train-stop",
            );
        }
        if (
            !journeyRestarted &&
            hadWorldState &&
            previousWeatherId !== this.resolved.world.weatherId &&
            this.resolved.world.weatherId === "monsoon" &&
            this.state === "ready"
        ) {
            this.playTrigger("weather-monsoon");
        }
        this.applyMix();
        this.ensureReactiveLayers();
        if (journeyRestarted)
            this.restartScore().catch((error) => {
                console.error("Could not restart the journey score:", error);
            });
        return this.resolved;
    }

    resetAudioTimeline() {
        this.lastTriggerAt.clear();
        this.ambienceCueEnvelope = null;
        for (const [id, layer] of this.layers) {
            if (!layer.asset.loop) this.stopLayer(id, { fade: 0.12 });
        }
    }

    setPresentationPaused(paused) {
        this.presentationPaused = Boolean(paused);
        return this.updateWorldState(this.lastSnapshot);
    }

    applyMix(duration = 0.16) {
        if (!this.context || this.state !== "ready") return;
        this.startDeferredScores();
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
        const environmentFilter = this.buses.get("environment")?.filter;
        if (environmentFilter)
            rampAudioParam(
                this.context,
                environmentFilter.frequency,
                this.resolved.filters.distantCutoff,
                0.45,
            );
        for (const layer of this.layers.values()) this.applyLayerTarget(layer);
    }

    async startLayer(id, { fade } = {}) {
        if (this.state !== "ready" || !this.loader)
            throw new Error("Enable the Sound Engine before starting a layer.");
        const asset = this.assets.get(id);
        if (!asset) throw new Error(`Unknown audio asset: ${id}`);
        const existing = this.layers.get(id);
        if (existing) {
            if (existing.stopped && existing.media) {
                globalThis.clearTimeout(existing.cleanupTimer);
                existing.cleanupTimer = 0;
                existing.stopped = false;
                await existing.media.play();
                this.applyLayerTarget(existing);
            }
            return existing;
        }
        if (!asset.loop) return this.playOneShot(id);
        if (asset.stream) return this.startStreamLayer(asset, { fade });

        const buffer = await this.loader.load(asset);
        if (this.destroyed || this.state !== "ready") return null;
        if (this.layers.has(id)) return this.layers.get(id);

        const source = this.context.createBufferSource();
        const panner = this.context.createStereoPanner?.() ?? null;
        const gain = this.context.createGain();
        source.buffer = buffer;
        source.loop = asset.loop;
        if (asset.loopStart > 0) source.loopStart = asset.loopStart;
        if (asset.loopEnd > 0) source.loopEnd = asset.loopEnd;
        gain.gain.setValueAtTime(0, this.context.currentTime);
        if (panner) {
            source.connect(panner);
            panner.connect(gain);
        } else {
            source.connect(gain);
        }
        gain.connect(this.buses.get(asset.bus).stateGain);

        const layer = {
            asset,
            source,
            panner,
            gain,
            fade: fade ?? asset.fade,
            targetGain: null,
            stopped: false,
        };
        this.layers.set(id, layer);
        source.onended = () => {
            if (this.layers.get(id) === layer) this.layers.delete(id);
            source.disconnect?.();
            panner?.disconnect?.();
            gain.disconnect?.();
        };
        source.start();
        this.failedAssets.delete(asset.id);
        this.applyLayerTarget(layer);
        return layer;
    }

    async startStreamLayer(asset, { fade } = {}) {
        const selected = selectPlayableSource(asset.sources, this.canPlayType);
        const media = this.createMediaElement?.();
        if (!selected || !media)
            throw new Error(`Streaming audio is unavailable for ${asset.id}.`);

        media.src = selected.src;
        const hasAuthoredLoopWindow = asset.loop && asset.loopEnd > 0;
        media.loop = asset.loop && !hasAuthoredLoopWindow;
        media.preload = "auto";
        media.playsInline = true;
        const source = this.context.createMediaElementSource(media);
        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0, this.context.currentTime);
        source.connect(gain);
        gain.connect(this.buses.get(asset.bus).stateGain);

        const layer = {
            asset,
            source,
            media,
            panner: null,
            gain,
            fade: fade ?? asset.fade,
            targetGain: null,
            cleanupTimer: 0,
            waitingForEntry: false,
            startingEntry: false,
            entryFadeUntil: 0,
            startPromise: null,
            stopped: false,
        };
        this.layers.set(asset.id, layer);
        media.onended = () => this.releaseStreamLayer(asset.id, layer);
        if (hasAuthoredLoopWindow)
            media.ontimeupdate = () => {
                if (media.currentTime < asset.loopEnd) return;
                media.currentTime = asset.loopStart;
                media.play().catch((error) => {
                    this.reportLayerError(asset, error);
                    this.releaseStreamLayer(asset.id, layer);
                });
            };
        const musicEntryAt = this.ambienceCueEnvelope?.musicEntryAt ?? 0;
        if (asset.bus === "music" && musicEntryAt > this.context.currentTime) {
            layer.waitingForEntry = true;
            layer.targetGain = 0;
            return layer;
        }
        try {
            layer.startPromise = media.play();
            await layer.startPromise;
            layer.startPromise = null;
            this.failedAssets.delete(asset.id);
            this.applyLayerTarget(layer);
            return layer;
        } catch (error) {
            layer.startPromise = null;
            this.releaseStreamLayer(asset.id, layer);
            throw error;
        }
    }

    startDeferredScores() {
        for (const [id, layer] of this.layers) {
            if (
                !layer.waitingForEntry ||
                this.context.currentTime <
                    (this.ambienceCueEnvelope?.musicEntryAt ?? 0)
            )
                continue;
            layer.waitingForEntry = false;
            layer.startingEntry = true;
            const entryFade =
                this.ambienceCueEnvelope?.musicEntryFade ||
                Math.min(layer.fade, 3);
            layer.startPromise = layer.media
                .play()
                .then(() => {
                    if (layer.stopped) return;
                    layer.startPromise = null;
                    layer.startingEntry = false;
                    layer.entryFadeUntil =
                        this.context.currentTime + entryFade;
                    this.applyLayerTarget(layer, {
                        gainDuration: entryFade,
                        forceGain: true,
                    });
                })
                .catch((error) => {
                    layer.startPromise = null;
                    this.reportLayerError(layer.asset, error);
                    this.releaseStreamLayer(id, layer);
                });
        }
    }

    deferIncomingScores(entryAt) {
        if (!(entryAt > this.context.currentTime)) return;
        for (const layer of this.layers.values()) {
            const roleTarget = this.resolved.layers[layer.asset.role] ?? 0;
            if (!layer.media || layer.asset.bus !== "music" || roleTarget <= 0.015)
                continue;
            layer.media.pause();
            layer.media.currentTime = 0;
            layer.waitingForEntry = true;
            layer.targetGain = 0;
            rampAudioParam(this.context, layer.gain.gain, 0, 0.12);
        }
    }

    releaseStreamLayer(id, layer = this.layers.get(id)) {
        if (!layer) return;
        globalThis.clearTimeout(layer.cleanupTimer);
        layer.media?.pause?.();
        if (layer.media) {
            layer.media.onended = null;
            layer.media.ontimeupdate = null;
            layer.media.removeAttribute?.("src");
            layer.media.load?.();
        }
        layer.source.disconnect?.();
        layer.gain.disconnect?.();
        if (this.layers.get(id) === layer) this.layers.delete(id);
    }

    ensureReactiveLayers() {
        if (this.state !== "ready") return;
        for (const asset of this.manifest) {
            if (!asset.reactive) continue;
            if (this.failedAssets.has(asset.id)) continue;
            const target = this.resolved.layers[asset.role] ?? 0;
            const existing = this.layers.get(asset.id);
            if (asset.stream && target <= 0.015) {
                if (existing && !existing.stopped)
                    this.stopLayer(asset.id, { fade: asset.fade });
                continue;
            }
            if (
                target <= 0.015 ||
                (existing && !existing.stopped) ||
                this.pendingLayers.has(asset.id)
            )
                continue;
            const request = this.startLayer(asset.id)
                .catch((error) => {
                    this.reportLayerError(asset, error);
                })
                .finally(() => this.pendingLayers.delete(asset.id));
            this.pendingLayers.set(asset.id, request);
        }
    }

    reportLayerError(asset, error) {
        const message = error instanceof Error ? error.message : String(error);
        this.failedAssets.set(asset.id, message);
        console.error(`Could not start audio layer ${asset.id}:`, error);
        this.onLayerError({ id: asset.id, label: asset.label, message });
    }

    retryFailedLayers() {
        this.failedAssets.clear();
        this.ensureReactiveLayers();
    }

    playTrigger(trigger, { force = false, auditionToken = 0 } = {}) {
        if (this.state !== "ready") return false;
        const matchingAssets = this.manifest.filter(
            (asset) => asset.trigger === trigger,
        );
        if (matchingAssets.length === 0) return false;
        const now = this.context.currentTime;
        const cooldown = Math.max(
            0,
            ...matchingAssets.map((asset) => asset.cooldown),
        );
        const lastTriggered = this.lastTriggerAt.get(trigger) ?? -Infinity;
        if (!force && now - lastTriggered < cooldown) return false;
        this.lastTriggerAt.set(trigger, now);
        const triggerGroups = new Set(
            matchingAssets.map((asset) => asset.triggerGroup),
        );
        for (const [key, layer] of this.layers) {
            if (
                layer.asset.trigger &&
                triggerGroups.has(layer.asset.triggerGroup) &&
                layer.asset.trigger !== trigger
            )
                this.stopLayer(key, { fade: 0.12 });
        }
        for (const asset of matchingAssets) {
            if (asset.durationHint > 0 && asset.musicEntryFraction > 0) {
                const startedAt = this.context.currentTime;
                const musicEntryAt =
                    startedAt + asset.durationHint * asset.musicEntryFraction;
                this.ambienceCueEnvelope = {
                    key: `pending:${asset.id}`,
                    startedAt,
                    duration: asset.durationHint,
                    fadeIn: asset.fadeIn,
                    fadeOut: asset.fadeOut,
                    ambienceFloor: asset.duckAmbience,
                    musicFloor: asset.duckMusic,
                    bus: asset.bus,
                    musicEntryAt,
                    musicEntryFade: asset.musicEntryFade,
                };
                this.deferIncomingScores(musicEntryAt);
            }
            this.playOneShot(asset.id, { auditionToken }).catch((error) => {
                this.reportLayerError(asset, error);
            });
        }
        return true;
    }

    previewTrigger(trigger) {
        const auditionToken = this.beginManualAudition();
        return this.playTrigger(trigger, { force: true, auditionToken });
    }

    beginManualAudition() {
        this.manualAuditionToken += 1;
        this.ambienceCueEnvelope = null;
        for (const [id, layer] of this.layers) {
            if (!layer.asset.loop) this.stopLayer(id, { fade: 0 });
        }
        return this.manualAuditionToken;
    }

    async restartScore() {
        this.beginManualAudition();
        const asset = this.manifest.find(
            (candidate) =>
                candidate.stream &&
                candidate.bus === "music" &&
                (this.resolved.layers[candidate.role] ?? 0) > 0.015,
        );
        if (!asset) return false;

        let layer = this.layers.get(asset.id);
        if (!layer) {
            layer = await (this.pendingLayers.get(asset.id) ??
                this.startLayer(asset.id));
            return Boolean(layer);
        }
        if (layer.startPromise) {
            try {
                await layer.startPromise;
            } catch {
                return false;
            }
        }
        if (!layer.media) return false;
        if (layer.stopped) {
            globalThis.clearTimeout(layer.cleanupTimer);
            layer.cleanupTimer = 0;
            layer.stopped = false;
        }
        layer.media.pause();
        layer.media.currentTime = 0;
        layer.waitingForEntry = false;
        layer.startingEntry = true;
        rampAudioParam(this.context, layer.gain.gain, 0, 0.12);
        try {
            await layer.media.play();
            if (layer.stopped) return false;
            layer.startingEntry = false;
            layer.entryFadeUntil = this.context.currentTime + 2;
            this.applyLayerTarget(layer, {
                gainDuration: 2,
                forceGain: true,
            });
            return true;
        } catch (error) {
            this.reportLayerError(layer.asset, error);
            this.releaseStreamLayer(layer.asset.id, layer);
            return false;
        }
    }

    async playOneShot(id, { auditionToken = 0 } = {}) {
        if (this.state !== "ready" || !this.loader)
            throw new Error("Enable the Sound Engine before playing a cue.");
        const asset = this.assets.get(id);
        if (!asset) throw new Error(`Unknown audio asset: ${id}`);

        const buffer = await this.loader.load(asset);
        if (this.destroyed || this.state !== "ready") return null;
        if (auditionToken && auditionToken !== this.manualAuditionToken)
            return null;
        const source = this.context.createBufferSource();
        const panner = this.context.createStereoPanner?.() ?? null;
        const gain = this.context.createGain();
        const key = `${id}#${++this.layerInstance}`;
        source.buffer = buffer;
        source.loop = false;
        const roleGain = this.resolved.layers[asset.role] ?? 1;
        const peakGain = asset.gain * roleGain;
        const startedAt = this.context.currentTime;
        const duration = Math.max(
            0,
            Number(buffer.duration) || asset.durationHint || 0,
        );
        const fadeIn = Math.min(asset.fadeIn, duration || asset.fadeIn);
        const fadeOut = Math.min(
            asset.fadeOut,
            Math.max(0, duration - fadeIn),
        );
        if (fadeIn > 0) {
            gain.gain.setValueAtTime(0, startedAt);
            gain.gain.linearRampToValueAtTime(peakGain, startedAt + fadeIn);
        } else {
            gain.gain.setValueAtTime(peakGain, startedAt);
        }
        if (duration > 0 && fadeOut > 0) {
            gain.gain.setValueAtTime(
                peakGain,
                startedAt + duration - fadeOut,
            );
            gain.gain.linearRampToValueAtTime(0, startedAt + duration);
        }
        if (panner) {
            source.connect(panner);
            panner.connect(gain);
        } else {
            source.connect(gain);
        }
        gain.connect(this.buses.get(asset.bus).stateGain);

        const layer = {
            key,
            asset,
            source,
            panner,
            gain,
            fade: 0.06,
            targetGain: peakGain,
            stopped: false,
        };
        if (
            duration > 0 &&
            (asset.duckAmbience < 1 || asset.duckMusic < 1)
        ) {
            this.ambienceCueEnvelope = {
                key,
                startedAt,
                duration,
                fadeIn,
                fadeOut,
                ambienceFloor: asset.duckAmbience,
                musicFloor: asset.duckMusic,
                bus: asset.bus,
                musicEntryAt:
                    asset.musicEntryFraction > 0
                        ? startedAt + duration * asset.musicEntryFraction
                        : 0,
                musicEntryFade: asset.musicEntryFade,
            };
            this.deferIncomingScores(this.ambienceCueEnvelope.musicEntryAt);
        }
        this.layers.set(key, layer);
        source.onended = () => {
            if (this.layers.get(key) === layer) this.layers.delete(key);
            source.disconnect?.();
            panner?.disconnect?.();
            gain.disconnect?.();
            if (this.ambienceCueEnvelope?.key === key)
                this.ambienceCueEnvelope = null;
        };
        source.start();
        this.failedAssets.delete(asset.id);
        return layer;
    }

    applyLayerTarget(
        layer,
        { gainDuration = null, forceGain = false } = {},
    ) {
        const { asset, source, panner, gain, fade } = layer;
        const roleGain = this.resolved.layers[asset.role] ?? 1;
        if (asset.loop) {
            if (layer.waitingForEntry || layer.startingEntry) return;
            const cueControlsAmbience =
                asset.role.startsWith("ambience-") &&
                this.ambienceCueEnvelope !== null;
            const cueAudibility = this.ambienceCueEnvelope
                ? this.resolveBusOutput(this.ambienceCueEnvelope.bus)
                : 1;
            const rawAmbienceGain = asset.role.startsWith("ambience-")
                ? resolveCueAmbienceGain(
                      this.ambienceCueEnvelope,
                      this.context.currentTime,
                  )
                : 1;
            const ambienceGain =
                1 + (rawAmbienceGain - 1) * cueAudibility;
            const cueControlsMusic =
                asset.role.startsWith("music-") &&
                this.ambienceCueEnvelope !== null;
            const musicGain = asset.role.startsWith("music-")
                ? resolveCueMusicGain(
                      this.ambienceCueEnvelope,
                      this.context.currentTime,
                  )
                : 1;
            const targetGain = asset.gain * roleGain * ambienceGain * musicGain;
            const cueControlsLayer = cueControlsAmbience || cueControlsMusic;
            if (
                !forceGain &&
                layer.entryFadeUntil > this.context.currentTime
            )
                return;
            if (
                cueControlsLayer ||
                layer.targetGain === null ||
                Math.abs(layer.targetGain - targetGain) > 0.001
            ) {
                rampAudioParam(
                    this.context,
                    gain.gain,
                    targetGain,
                    gainDuration ??
                        (cueControlsLayer ? Math.min(fade, 0.14) : fade),
                );
                layer.targetGain = targetGain;
            }
        }
        const playbackRate = this.resolved.playbackRates[asset.role];
        if (playbackRate && source.playbackRate)
            rampAudioParam(this.context, source.playbackRate, playbackRate, 0.2);
        const pan = this.resolved.pans[asset.role];
        if (panner?.pan && Number.isFinite(pan))
            rampAudioParam(this.context, panner.pan, pan, 0.28);
    }

    stopLayer(id, { fade = 0.25 } = {}) {
        const layer = this.layers.get(id);
        if (!layer || layer.stopped) return false;
        layer.stopped = true;
        rampAudioParam(this.context, layer.gain.gain, 0, fade);
        layer.targetGain = 0;
        if (layer.media) {
            if (layer.waitingForEntry) {
                this.releaseStreamLayer(id, layer);
                return true;
            }
            globalThis.clearTimeout(layer.cleanupTimer);
            if (fade <= 0) this.releaseStreamLayer(id, layer);
            else
                layer.cleanupTimer = globalThis.setTimeout(
                    () => this.releaseStreamLayer(id, layer),
                    fade * 1000 + 40,
                );
            layer.cleanupTimer?.unref?.();
            return true;
        }
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
            busMuted: Object.freeze({ ...this.busMuted }),
            soloBus: this.soloBus,
            activeLayers: Object.freeze([...this.layers.keys()]),
            layerDetails: Object.freeze(
                [...this.layers.values()].map(({ asset, stopped }) => ({
                    id: asset.id,
                    label: asset.label,
                    bus: asset.bus,
                    role: asset.role,
                    fadingOut: stopped,
                })),
            ),
            failedLayers: Object.freeze(
                [...this.failedAssets].map(([id, message]) => ({
                    id,
                    label: this.assets.get(id)?.label ?? id,
                    message,
                })),
            ),
            activeScores: Object.freeze(
                [...this.layers.values()]
                    .filter(
                        ({ asset }) => asset.stream && asset.bus === "music",
                    )
                    .map(({ asset, stopped }) => ({
                        id: asset.id,
                        label: asset.label,
                        fadingOut: stopped,
                    })),
            ),
            resolved: this.resolved,
        });
    }

    async destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const id of [...this.layers.keys()]) this.stopLayer(id, { fade: 0 });
        this.loader?.clear();
        this.ambienceCueEnvelope = null;
        this.pendingLayers.clear();
        this.failedAssets.clear();
        for (const output of [...this.recordingOutputs]) output.release();
        this.lastTriggerAt.clear();
        this.manualAuditionToken += 1;
        for (const { stateGain, volumeGain, filter } of this.buses.values()) {
            stateGain.disconnect?.();
            volumeGain.disconnect?.();
            filter?.disconnect?.();
        }
        this.masterGain?.disconnect?.();
        this.compressor?.disconnect?.();
        if (this.context && this.context.state !== "closed")
            await this.context.close();
        this.buses.clear();
        this.setState("destroyed");
    }
}
