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

const BASE_SCENE_COLORS = Object.freeze({
    skyColor: [0.58, 0.7, 1],
    cloudShadow: [0.43, 0.32, 0.31],
    cloudMid: [0.77, 0.48, 0.46],
    cloudWarm: [0.98, 0.42, 0.28],
    cloudLight: [1, 0.94, 0.91],
    smokeLight: [1, 0.94, 0.91],
    smokeShadow: [0.92, 0.85, 0.82],
    trainDarkColor: [0.18, 0.12, 0.15],
    trainBodyColor: [0.48, 0.19, 0.2],
    locomotiveColor: [0.38, 0.19, 0.2],
    bridgeColor: [0.29, 0.09, 0.08],
    practicalLightColor: [1, 0.52, 0.18],
    fogColor: [0.72, 0.54, 0.5],
});

// Authored scenes choose a physical weather baseline explicitly. The legacy
// weather-like world values remain in the scene definitions for palette and
// transition compatibility, but no longer decide "Authored scene" weather.
export const SCENE_DEFAULT_WEATHER = Object.freeze({
    departure: "clear",
    ember: "clear",
    "blue-hour": "haze",
    sakura: "clear",
    monsoon: "monsoon",
    "night-rail": "haze",
});

export const AUTHORING_COLORS = Object.freeze([
    { key: "low", label: "Grade shadow" },
    { key: "high", label: "Grade light" },
    { key: "skyColor", label: "Sky" },
    { key: "cloudShadow", label: "Cloud shadow" },
    { key: "cloudMid", label: "Cloud midtone" },
    { key: "cloudWarm", label: "Cloud accent" },
    { key: "cloudLight", label: "Cloud highlight" },
    { key: "smokeLight", label: "Smoke light" },
    { key: "smokeShadow", label: "Smoke shadow" },
    { key: "trainDarkColor", label: "Train dark" },
    { key: "trainBodyColor", label: "Train body" },
    { key: "locomotiveColor", label: "Locomotive" },
    { key: "bridgeColor", label: "Bridge" },
    { key: "practicalLightColor", label: "Practical lights" },
    { key: "fogColor", label: "Fog" },
]);

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
    ...Object.fromEntries(AUTHORING_COLORS.map(({ key }) => [key, "color"])),
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
const AUTHORABLE_COLOR_KEYS = new Set(AUTHORING_COLORS.map(({ key }) => key));

function sceneColors(overrides = {}) {
    return Object.fromEntries(
        Object.entries({ ...BASE_SCENE_COLORS, ...overrides }).map(
            ([key, value]) => [key, Object.freeze([...value])],
        ),
    );
}

function mood(id, name, low, high, world = {}, colors = {}, transition = {}) {
    return Object.freeze({
        id,
        name,
        defaultWeatherId: SCENE_DEFAULT_WEATHER[id] ?? "clear",
        low: Object.freeze(low),
        high: Object.freeze(high),
        world: Object.freeze({ ...BASE_WORLD, ...world }),
        colors: Object.freeze(sceneColors(colors)),
        transition: Object.freeze({
            ...DEFAULT_TRANSITION,
            ...transition,
        }),
    });
}

const SHADER_BASE = mood(
    "shader-base",
    "Shader Base",
    [0.16, 0.08, 0.07],
    [1, 0.76, 0.6],
);

export const MOODS = Object.freeze([
    mood(
        "departure",
        "Departure",
        [0.09, 0.055, 0.07],
        [0.96, 0.69, 0.5],
        {
            exposure: 0.94,
            cloudCoverage: -0.025,
            cloudHeight: 0.02,
            cloudScale: 1.04,
            turbulence: 0.86,
            windSpeed: 0.78,
            smokeAmount: 0.78,
            fogDensity: 0.08,
            contrast: 0.94,
            trainEmphasis: 0.38,
            bridgeEmphasis: 0.18,
        },
        {
            skyColor: [0.53, 0.61, 0.76],
            cloudShadow: [0.29, 0.23, 0.3],
            cloudMid: [0.68, 0.43, 0.43],
            cloudWarm: [0.95, 0.57, 0.35],
            cloudLight: [1, 0.84, 0.69],
            smokeLight: [0.94, 0.88, 0.83],
            smokeShadow: [0.7, 0.62, 0.61],
            trainDarkColor: [0.13, 0.09, 0.12],
            trainBodyColor: [0.4, 0.16, 0.18],
            locomotiveColor: [0.31, 0.14, 0.17],
            bridgeColor: [0.24, 0.08, 0.08],
            practicalLightColor: [1, 0.55, 0.2],
            fogColor: [0.69, 0.55, 0.55],
        },
    ),
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
        {
            skyColor: [0.62, 0.2, 0.12],
            cloudShadow: [0.27, 0.055, 0.04],
            cloudMid: [0.67, 0.16, 0.08],
            cloudWarm: [1, 0.36, 0.1],
            cloudLight: [1, 0.69, 0.42],
            smokeLight: [1, 0.86, 0.72],
            smokeShadow: [0.72, 0.42, 0.34],
            trainDarkColor: [0.14, 0.035, 0.025],
            trainBodyColor: [0.48, 0.08, 0.035],
            locomotiveColor: [0.34, 0.06, 0.035],
            bridgeColor: [0.23, 0.035, 0.025],
            practicalLightColor: [1, 0.48, 0.12],
            fogColor: [0.5, 0.15, 0.09],
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
        {
            skyColor: [0.12, 0.18, 0.36],
            cloudShadow: [0.045, 0.065, 0.15],
            cloudMid: [0.2, 0.28, 0.5],
            cloudWarm: [0.48, 0.45, 0.64],
            cloudLight: [0.73, 0.78, 0.94],
            smokeLight: [0.68, 0.72, 0.84],
            smokeShadow: [0.35, 0.4, 0.58],
            trainDarkColor: [0.055, 0.06, 0.13],
            trainBodyColor: [0.18, 0.22, 0.4],
            locomotiveColor: [0.13, 0.16, 0.32],
            bridgeColor: [0.065, 0.07, 0.16],
            practicalLightColor: [1, 0.59, 0.24],
            fogColor: [0.26, 0.34, 0.56],
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
        {
            skyColor: [0.75, 0.57, 0.68],
            cloudShadow: [0.34, 0.16, 0.27],
            cloudMid: [0.72, 0.39, 0.52],
            cloudWarm: [0.96, 0.59, 0.64],
            cloudLight: [1, 0.83, 0.84],
            smokeLight: [1, 0.9, 0.9],
            smokeShadow: [0.77, 0.61, 0.68],
            trainDarkColor: [0.16, 0.055, 0.1],
            trainBodyColor: [0.46, 0.16, 0.25],
            locomotiveColor: [0.35, 0.12, 0.21],
            bridgeColor: [0.25, 0.07, 0.13],
            practicalLightColor: [1, 0.59, 0.25],
            fogColor: [0.72, 0.48, 0.6],
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
            skyColor: [0.1, 0.22, 0.25],
            cloudShadow: [0.035, 0.11, 0.12],
            cloudMid: [0.16, 0.35, 0.35],
            cloudWarm: [0.35, 0.52, 0.47],
            cloudLight: [0.58, 0.7, 0.64],
            smokeLight: [0.66, 0.72, 0.68],
            smokeShadow: [0.3, 0.42, 0.41],
            trainDarkColor: [0.035, 0.08, 0.09],
            trainBodyColor: [0.1, 0.27, 0.27],
            locomotiveColor: [0.075, 0.2, 0.21],
            bridgeColor: [0.035, 0.12, 0.12],
            practicalLightColor: [1, 0.59, 0.22],
            fogColor: [0.24, 0.43, 0.43],
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
            skyColor: [0.025, 0.025, 0.08],
            cloudShadow: [0.018, 0.015, 0.05],
            cloudMid: [0.08, 0.075, 0.2],
            cloudWarm: [0.22, 0.18, 0.36],
            cloudLight: [0.4, 0.38, 0.62],
            smokeLight: [0.42, 0.4, 0.55],
            smokeShadow: [0.16, 0.15, 0.28],
            trainDarkColor: [0.02, 0.018, 0.05],
            trainBodyColor: [0.09, 0.075, 0.18],
            locomotiveColor: [0.06, 0.05, 0.13],
            bridgeColor: [0.025, 0.02, 0.065],
            practicalLightColor: [1, 0.48, 0.16],
            fogColor: [0.11, 0.12, 0.27],
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
        ...Object.fromEntries(
            Object.entries(preset.colors).map(([key, value]) => [
                key,
                [...value],
            ]),
        ),
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
        const openingPreset = MOODS[0];
        const openingState = flattenPreset(openingPreset);
        this.base = flattenPreset(SHADER_BASE);
        this.currentId = openingPreset.id;
        this.current = cloneState(openingState);
        this.from = cloneState(openingState);
        this.target = cloneState(openingState);
        this.transition = openingPreset.transition;
        this.transitionStart = nowSeconds;
        this.intensity = 1;
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

    delayTimeline(seconds) {
        const delay = Math.max(0, Number(seconds) || 0);
        this.transitionStart += delay;
        this.lastCycle += delay;
    }

    setOverride(key, value) {
        if (AUTHORABLE_COLOR_KEYS.has(key)) {
            if (
                !Array.isArray(value) ||
                value.length !== 3 ||
                value.some((channel) => !Number.isFinite(Number(channel)))
            ) return false;
            this.overrides[key] = value.map((channel) => clamp01(Number(channel)));
            return true;
        }
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
            defaultWeatherId: this.getPreset(this.currentId).defaultWeatherId,
            intensity: this.intensity,
            ...blendState(this.base, this.current, this.intensity),
        };
        Object.assign(resolved, this.overrides);
        return resolved;
    }
}
