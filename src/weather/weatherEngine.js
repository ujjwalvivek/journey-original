const clamp = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, Number(value)));

export const WEATHER_CONTROLS = Object.freeze([
    {
        key: "cloudCoverage",
        label: "Cloud coverage",
        min: -0.2,
        max: 0.28,
        step: 0.005,
    },
    {
        key: "cloudHeight",
        label: "Cloud height",
        min: -0.12,
        max: 0.12,
        step: 0.005,
    },
    {
        key: "cloudScale",
        label: "Cloud feature size",
        min: 0.6,
        max: 1.5,
        step: 0.01,
    },
    { key: "turbulence", label: "Turbulence", min: 0.45, max: 1.6, step: 0.01 },
    { key: "windSpeed", label: "Wind speed", min: 0, max: 2.5, step: 0.01 },
    {
        key: "windDirection",
        label: "Wind direction",
        min: -1,
        max: 1,
        step: 0.01,
    },
    { key: "gustiness", label: "Gustiness", min: 0, max: 1, step: 0.01 },
    {
        key: "smokeAmount",
        label: "Smoke response",
        min: 0,
        max: 1.5,
        step: 0.01,
    },
    { key: "fogDensity", label: "Fog", min: 0, max: 0.75, step: 0.01 },
    { key: "visibility", label: "Visibility", min: 0, max: 1, step: 0.01 },
    { key: "horizonHaze", label: "Horizon haze", min: 0, max: 1, step: 0.01 },
    { key: "mistDensity", label: "Mist", min: 0, max: 1, step: 0.01 },
    { key: "mistHeight", label: "Mist height", min: 0, max: 1, step: 0.01 },
    {
        key: "precipitation",
        label: "Precipitation",
        min: 0,
        max: 1,
        step: 0.01,
    },
    { key: "rainDensity", label: "Rain density", min: 0, max: 1, step: 0.01 },
    { key: "rainSpeed", label: "Rain speed", min: 0.2, max: 2.5, step: 0.01 },
    { key: "rainLength", label: "Rain length", min: 0.2, max: 2, step: 0.01 },
    { key: "rainAngle", label: "Rain angle", min: -1, max: 1, step: 0.01 },
    { key: "wetness", label: "Wetness", min: 0, max: 1, step: 0.01 },
    { key: "lightScatter", label: "Light scatter", min: 0, max: 1, step: 0.01 },
    {
        key: "dryingRate",
        label: "Drying rate",
        min: 0.01,
        max: 0.5,
        step: 0.01,
    },
]);

const CONTROL_BY_KEY = new Map(
    WEATHER_CONTROLS.map((control) => [control.key, control]),
);

export const BASE_WEATHER = Object.freeze({
    cloudCoverage: 0,
    cloudHeight: 0,
    cloudScale: 1,
    turbulence: 1,
    windSpeed: 1,
    windDirection: 1,
    gustiness: 0,
    smokeAmount: 1,
    fogDensity: 0,
    visibility: 1,
    horizonHaze: 0,
    mistDensity: 0,
    mistHeight: 0.22,
    precipitation: 0,
    rainDensity: 0,
    rainSpeed: 1,
    rainLength: 1,
    rainAngle: 0,
    wetness: 0,
    lightScatter: 0,
    dryingRate: 0.12,
});

export const WEATHER_STATE_KEYS = Object.freeze(Object.keys(BASE_WEATHER));
export const LEGACY_WEATHER_KEYS = Object.freeze([
    "cloudCoverage",
    "cloudHeight",
    "cloudScale",
    "turbulence",
    "windSpeed",
    "smokeAmount",
    "fogDensity",
]);
export const RENDERED_WEATHER_CONTROLS = Object.freeze(
    WEATHER_CONTROLS.filter(({ key }) =>
        [
            ...LEGACY_WEATHER_KEYS,
            "windDirection",
            "gustiness",
            "visibility",
            "horizonHaze",
            "mistDensity",
            "mistHeight",
            "precipitation",
            "rainDensity",
            "rainSpeed",
            "rainLength",
            "rainAngle",
            "wetness",
            "lightScatter",
            "dryingRate",
        ].includes(key),
    ),
);

const DEFAULT_TRANSITION = Object.freeze({
    cloud: Object.freeze({ duration: 8, easing: "smooth" }),
    motion: Object.freeze({ duration: 5, easing: "easeOut" }),
    atmosphere: Object.freeze({ duration: 9, easing: "smooth" }),
    precipitation: Object.freeze({ duration: 4, easing: "smooth" }),
    surface: Object.freeze({ duration: 14, easing: "smooth" }),
});

const PROPERTY_GROUP = Object.freeze({
    cloudCoverage: "cloud",
    cloudHeight: "cloud",
    cloudScale: "cloud",
    turbulence: "cloud",
    windSpeed: "motion",
    windDirection: "motion",
    gustiness: "motion",
    smokeAmount: "motion",
    fogDensity: "atmosphere",
    visibility: "atmosphere",
    horizonHaze: "atmosphere",
    mistDensity: "atmosphere",
    mistHeight: "atmosphere",
    precipitation: "precipitation",
    rainDensity: "precipitation",
    rainSpeed: "precipitation",
    rainLength: "precipitation",
    rainAngle: "precipitation",
    wetness: "surface",
    lightScatter: "surface",
    dryingRate: "surface",
});

function freezeTransition(overrides = {}) {
    return Object.freeze(
        Object.fromEntries(
            Object.entries({ ...DEFAULT_TRANSITION, ...overrides }).map(
                ([group, timing]) => [group, Object.freeze({ ...timing })],
            ),
        ),
    );
}

function weatherPreset(id, name, state, transition = {}) {
    return Object.freeze({
        id,
        name,
        state: Object.freeze({ ...BASE_WEATHER, ...state }),
        transition: freezeTransition(transition),
    });
}

export const WEATHER_PRESETS = Object.freeze([
    Object.freeze({
        id: "scene",
        name: "Authored scene",
        state: null,
        transition: DEFAULT_TRANSITION,
    }),
    weatherPreset("clear", "Clear", {
        cloudCoverage: -0.08,
        cloudHeight: 0.035,
        cloudScale: 0.92,
        turbulence: 0.72,
        windSpeed: 0.55,
        visibility: 1,
        horizonHaze: 0.04,
        dryingRate: 0.2,
    }),
    weatherPreset("haze", "Haze", {
        cloudCoverage: -0.02,
        cloudHeight: 0.02,
        cloudScale: 1.06,
        turbulence: 0.72,
        windSpeed: 0.35,
        fogDensity: 0.16,
        visibility: 0.68,
        horizonHaze: 0.58,
        mistDensity: 0.08,
        lightScatter: 0.2,
    }),
    weatherPreset("overcast", "Overcast", {
        cloudCoverage: 0.16,
        cloudHeight: -0.04,
        cloudScale: 1.18,
        turbulence: 0.96,
        windSpeed: 0.76,
        fogDensity: 0.28,
        visibility: 0.58,
        horizonHaze: 0.44,
        mistDensity: 0.16,
        lightScatter: 0.28,
    }),
    weatherPreset("drizzle", "Drizzle", {
        cloudCoverage: 0.19,
        cloudHeight: -0.045,
        cloudScale: 1.14,
        turbulence: 1.05,
        windSpeed: 0.92,
        gustiness: 0.18,
        smokeAmount: 0.62,
        fogDensity: 0.36,
        visibility: 0.46,
        horizonHaze: 0.52,
        mistDensity: 0.32,
        mistHeight: 0.28,
        precipitation: 0.34,
        rainDensity: 0.42,
        rainSpeed: 0.82,
        rainLength: 0.62,
        rainAngle: 0.14,
        wetness: 0.38,
        lightScatter: 0.42,
    }),
    weatherPreset(
        "monsoon",
        "Monsoon",
        {
            cloudCoverage: 0.26,
            cloudHeight: -0.07,
            cloudScale: 1.26,
            turbulence: 1.48,
            windSpeed: 1.85,
            gustiness: 0.72,
            smokeAmount: 0.28,
            fogDensity: 0.58,
            visibility: 0.24,
            horizonHaze: 0.7,
            mistDensity: 0.58,
            mistHeight: 0.38,
            precipitation: 1,
            rainDensity: 1,
            rainSpeed: 1.72,
            rainLength: 1.48,
            rainAngle: 0.42,
            wetness: 1,
            lightScatter: 0.86,
            dryingRate: 0.04,
        },
        {
            cloud: { duration: 11, easing: "smooth" },
            atmosphere: { duration: 12, easing: "smooth" },
            precipitation: { duration: 6.5, easing: "smooth" },
            surface: { duration: 18, easing: "smooth" },
        },
    ),
    weatherPreset(
        "clearing",
        "Clearing",
        {
            cloudCoverage: 0.04,
            cloudHeight: 0.015,
            cloudScale: 0.9,
            turbulence: 0.82,
            windSpeed: 1.08,
            gustiness: 0.24,
            smokeAmount: 0.82,
            fogDensity: 0.12,
            visibility: 0.78,
            horizonHaze: 0.2,
            mistDensity: 0.12,
            precipitation: 0,
            rainDensity: 0.04,
            rainSpeed: 1.1,
            rainLength: 0.48,
            wetness: 0.62,
            lightScatter: 0.22,
            dryingRate: 0.08,
        },
        {
            precipitation: { duration: 3.2, easing: "easeOut" },
            atmosphere: { duration: 10, easing: "smooth" },
            surface: { duration: 24, easing: "smooth" },
        },
    ),
]);

function normalizeState(source = {}) {
    return Object.fromEntries(
        WEATHER_CONTROLS.map((control) => [
            control.key,
            clamp(
                source[control.key] ?? BASE_WEATHER[control.key],
                control.min,
                control.max,
            ),
        ]),
    );
}

function easing(name, value) {
    const t = Math.max(0, Math.min(1, value));
    if (name === "linear") return t;
    if (name === "easeOut") return 1 - (1 - t) ** 3;
    return t * t * (3 - 2 * t);
}

function transitionDuration(transition) {
    return Math.max(
        ...Object.values(transition).map(({ duration }) => duration),
    );
}

export function extractSceneWeather(sceneState = {}) {
    return normalizeState(sceneState);
}

export function composeWeather(sceneState, weatherState) {
    return { ...sceneState, ...normalizeState(weatherState) };
}

export class WeatherEngine {
    constructor(nowSeconds = performance.now() / 1000) {
        this.currentId = "scene";
        this.current = null;
        this.from = null;
        this.target = null;
        this.transition = DEFAULT_TRANSITION;
        this.transitionStart = nowSeconds;
        this.transitioning = false;
        this.overrides = {};
    }

    getPreset(id) {
        return (
            WEATHER_PRESETS.find((preset) => preset.id === id) ??
            WEATHER_PRESETS[0]
        );
    }

    setWeather(id, nowSeconds = performance.now() / 1000, sceneState = {}) {
        const preset = this.getPreset(id);
        const resolved = this.update(nowSeconds, sceneState);
        if (preset.id === this.currentId && !this.transitioning)
            return preset.id;
        this.from = normalizeState(resolved);
        this.current = { ...this.from };
        this.currentId = preset.id;
        this.target = preset.state ? normalizeState(preset.state) : null;
        this.transition = preset.transition ?? DEFAULT_TRANSITION;
        this.transitionStart = nowSeconds;
        this.transitioning = true;
        return preset.id;
    }

    setOverride(key, value) {
        const control = CONTROL_BY_KEY.get(key);
        if (!control || !Number.isFinite(Number(value))) return false;
        this.overrides[key] = clamp(value, control.min, control.max);
        return true;
    }

    clearOverrides() {
        this.overrides = {};
    }

    update(nowSeconds, sceneState = {}) {
        const sceneWeather = normalizeState(sceneState);
        if (!this.current) {
            this.current = { ...sceneWeather };
            this.from = { ...sceneWeather };
        }

        const target = this.currentId === "scene" ? sceneWeather : this.target;

        if (!this.transitioning) {
            this.current = { ...target };
        } else {
            const elapsed = Math.max(0, nowSeconds - this.transitionStart);
            for (const key of WEATHER_STATE_KEYS) {
                const group = PROPERTY_GROUP[key];
                const timing =
                    this.transition[group] ?? DEFAULT_TRANSITION[group];
                const progress =
                    timing.duration <= 0 ? 1 : elapsed / timing.duration;
                const amount = easing(timing.easing, progress);
                this.current[key] =
                    this.from[key] + (target[key] - this.from[key]) * amount;
            }
            if (elapsed >= transitionDuration(this.transition)) {
                this.current = { ...target };
                this.transitioning = false;
            }
        }

        return {
            id: this.currentId,
            ...this.current,
            ...this.overrides,
        };
    }
}
