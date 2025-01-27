const clamp01 = (value) => Math.max(0, Math.min(1, value));

const BASE_WORLD = Object.freeze({
    exposure: 1,
    cloudCoverage: 0,
    cloudHeight: 0,
    cloudScale: 1,
    turbulence: 1,
    windSpeed: 1,
    smokeAmount: 1,
    fogDensity: 0,
    contrast: 1,
    trainEmphasis: 0,
    bridgeEmphasis: 0,
});

const DEFAULT_TRANSITION = Object.freeze({
    color: { duration: 4.8, easing: "smooth" },
    structure: { duration: 7.5, easing: "smooth" },
    motion: { duration: 5.2, easing: "easeOut" },
    atmosphere: { duration: 9, easing: "smooth" },
    subject: { duration: 3.5, easing: "easeOut" },
});

const PROPERTY_GROUP = Object.freeze({
    low: "color",
    high: "color",
    exposure: "color",
    cloudCoverage: "structure",
    cloudHeight: "structure",
    cloudScale: "structure",
    turbulence: "structure",
    windSpeed: "motion",
    smokeAmount: "motion",
    fogDensity: "atmosphere",
    contrast: "atmosphere",
    trainEmphasis: "subject",
    bridgeEmphasis: "subject",
});

export const AUTHORING_CONTROLS = Object.freeze([
    { key: "exposure", label: "Exposure", min: 0.35, max: 1.3, step: 0.01 },
    { key: "cloudCoverage", label: "Cloud coverage", min: -0.2, max: 0.28, step: 0.005 },
    { key: "cloudHeight", label: "Cloud height", min: -0.12, max: 0.12, step: 0.005 },
    { key: "cloudScale", label: "Cloud feature size", min: 0.6, max: 1.5, step: 0.01 },
    { key: "turbulence", label: "Turbulence", min: 0.45, max: 1.6, step: 0.01 },
    { key: "windSpeed", label: "Wind speed", min: 0, max: 2.5, step: 0.01 },
    { key: "smokeAmount", label: "Smoke", min: 0, max: 1.5, step: 0.01 },
    { key: "fogDensity", label: "Fog", min: 0, max: 0.75, step: 0.01 },
    { key: "contrast", label: "Contrast", min: 0.6, max: 1.4, step: 0.01 },
    { key: "trainEmphasis", label: "Train emphasis", min: 0, max: 1, step: 0.01 },
    { key: "bridgeEmphasis", label: "Bridge lights", min: 0, max: 1, step: 0.01 },
]);

const AUTHORABLE_KEYS = new Set(AUTHORING_CONTROLS.map(({ key }) => key));

function mood(id, name, low, high, world = {}, transition = {}) {
    return Object.freeze({
        id,
        name,
        low: Object.freeze(low),
        high: Object.freeze(high),
        world: Object.freeze({ ...BASE_WORLD, ...world }),
        transition: Object.freeze({
            ...DEFAULT_TRANSITION,
            ...transition,
        }),
    });
}

export const MOODS = Object.freeze([
    mood("original", "Original", [0.16, 0.08, 0.07], [1, 0.76, 0.6]),
    mood(
        "ember",
        "Ember",
        [0.13, 0.025, 0.018],
        [1, 0.47, 0.16],
        {
            exposure: 1.06,
            cloudCoverage: -0.09,
            cloudHeight: 0.025,
            cloudScale: 1.12,
            turbulence: 1.22,
            windSpeed: 1.34,
            smokeAmount: 1.22,
            fogDensity: 0.04,
            contrast: 1.14,
            trainEmphasis: 0.42,
            bridgeEmphasis: 0.28,
        },
    ),
    mood(
        "blue-hour",
        "Blue Hour",
        [0.035, 0.055, 0.15],
        [0.56, 0.69, 1],
        {
            exposure: 0.82,
            cloudCoverage: 0.06,
            cloudHeight: -0.018,
            cloudScale: 0.92,
            turbulence: 0.82,
            windSpeed: 0.62,
            smokeAmount: 0.7,
            fogDensity: 0.26,
            contrast: 0.88,
            trainEmphasis: 0.7,
            bridgeEmphasis: 0.45,
        },
    ),
    mood(
        "sakura",
        "Sakura",
        [0.17, 0.055, 0.1],
        [1, 0.68, 0.74],
        {
            exposure: 1.08,
            cloudCoverage: -0.035,
            cloudHeight: 0.045,
            cloudScale: 0.86,
            turbulence: 0.72,
            windSpeed: 0.52,
            smokeAmount: 0.58,
            fogDensity: 0.1,
            contrast: 0.94,
            trainEmphasis: 0.48,
            bridgeEmphasis: 0.2,
        },
    ),
    mood(
        "monsoon",
        "Monsoon",
        [0.035, 0.1, 0.12],
        [0.43, 0.72, 0.69],
        {
            exposure: 0.68,
            cloudCoverage: 0.2,
            cloudHeight: -0.05,
            cloudScale: 1.2,
            turbulence: 1.38,
            windSpeed: 1.62,
            smokeAmount: 0.32,
            fogDensity: 0.48,
            contrast: 1.08,
            trainEmphasis: 0.82,
            bridgeEmphasis: 0.55,
        },
        {
            color: { duration: 6.5, easing: "smooth" },
            structure: { duration: 10, easing: "smooth" },
            atmosphere: { duration: 12, easing: "smooth" },
        },
    ),
    mood(
        "night-rail",
        "Night Rail",
        [0.025, 0.018, 0.055],
        [0.37, 0.34, 0.7],
        {
            exposure: 0.54,
            cloudCoverage: 0.115,
            cloudHeight: -0.035,
            cloudScale: 0.78,
            turbulence: 0.6,
            windSpeed: 0.34,
            smokeAmount: 0.82,
            fogDensity: 0.38,
            contrast: 1.16,
            trainEmphasis: 1,
            bridgeEmphasis: 0.95,
        },
        {
            color: { duration: 8, easing: "smooth" },
            structure: { duration: 11, easing: "smooth" },
            atmosphere: { duration: 13, easing: "smooth" },
        },
    ),
]);

function easing(name, value) {
    const t = clamp01(value);
    if (name === "linear") return t;
    if (name === "easeOut") return 1 - (1 - t) ** 3;
    return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpValue(a, b, t) {
    if (Array.isArray(a))
        return a.map((value, index) => lerp(value, b[index], t));
    return lerp(a, b, t);
}

function flattenPreset(preset) {
    return {
        low: [...preset.low],
        high: [...preset.high],
        ...preset.world,
    };
}

function cloneState(state) {
    return Object.fromEntries(
        Object.entries(state).map(([key, value]) => [
            key,
            Array.isArray(value) ? [...value] : value,
        ]),
    );
}

function blendState(base, target, intensity) {
    return Object.fromEntries(
        Object.keys(base).map((key) => [
            key,
            lerpValue(base[key], target[key], intensity),
        ]),
    );
}

export class MoodEngine {
    constructor(nowSeconds = performance.now() / 1000) {
        this.base = flattenPreset(MOODS[0]);
        this.currentId = "original";
        this.current = cloneState(this.base);
        this.from = cloneState(this.base);
        this.target = cloneState(this.base);
        this.transition = DEFAULT_TRANSITION;
        this.transitionStart = nowSeconds;
        this.intensity = 0;
        this.autoCycle = false;
        this.cycleSeconds = 14;
        this.lastCycle = nowSeconds;
        this.overrides = {};
    }

    getPreset(id) {
        return MOODS.find((entry) => entry.id === id) ?? MOODS[0];
    }

    setMood(id, nowSeconds = performance.now() / 1000) {
        const preset = this.getPreset(id);
        this.updateTransition(nowSeconds);
        this.currentId = preset.id;
        this.from = cloneState(this.current);
        this.target = flattenPreset(preset);
        this.transition = preset.transition;
        this.transitionStart = nowSeconds;
        this.lastCycle = nowSeconds;
    }

    setIntensity(value) {
        this.intensity = clamp01(Number(value) || 0);
    }

    setAutoCycle(enabled, nowSeconds = performance.now() / 1000) {
        this.autoCycle = Boolean(enabled);
        this.lastCycle = nowSeconds;
    }

    setCycleSeconds(value) {
        this.cycleSeconds = Math.max(5, Math.min(60, Number(value) || 14));
    }

    setOverride(key, value) {
        if (!AUTHORABLE_KEYS.has(key)) return false;
        const control = AUTHORING_CONTROLS.find((entry) => entry.key === key);
        const number = Number(value);
        if (!Number.isFinite(number)) return false;
        this.overrides[key] = Math.max(control.min, Math.min(control.max, number));
        return true;
    }

    clearOverrides() {
        this.overrides = {};
    }

    next(nowSeconds = performance.now() / 1000) {
        const currentIndex = Math.max(
            0,
            MOODS.findIndex((entry) => entry.id === this.currentId),
        );
        const nextPreset = MOODS[(currentIndex + 1) % MOODS.length];
        this.setMood(nextPreset.id, nowSeconds);
        return nextPreset.id;
    }

    updateTransition(nowSeconds) {
        const elapsed = Math.max(0, nowSeconds - this.transitionStart);
        for (const key of Object.keys(this.target)) {
            const group = PROPERTY_GROUP[key];
            const timing = this.transition[group] ?? DEFAULT_TRANSITION[group];
            const progress = timing.duration <= 0 ? 1 : elapsed / timing.duration;
            this.current[key] = lerpValue(
                this.from[key],
                this.target[key],
                easing(timing.easing, progress),
            );
        }
    }

    update(nowSeconds) {
        if (this.autoCycle && nowSeconds - this.lastCycle >= this.cycleSeconds) {
            this.next(nowSeconds);
        }

        this.updateTransition(nowSeconds);
        const resolved = {
            id: this.currentId,
            intensity: this.intensity,
            ...blendState(this.base, this.current, this.intensity),
        };
        Object.assign(resolved, this.overrides);
        return resolved;
    }
}
