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
    { key: "mistSpeed", label: "Mist speed", min: 0, max: 2, step: 0.01 },
    {
        key: "atmosphericDesaturation",
        label: "Atmospheric desaturation",
        min: 0,
        max: 1,
        step: 0.01,
    },
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
    {
        key: "rainDepthDistribution",
        label: "Rain depth bias",
        min: -1,
        max: 1,
        step: 0.01,
    },
    { key: "rainContrast", label: "Rain contrast", min: 0, max: 1, step: 0.01 },
    {
        key: "foregroundRainAmount",
        label: "Foreground rain",
        min: 0,
        max: 1,
        step: 0.01,
    },
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

const controlsFor = (keys) =>
    Object.freeze(
        keys.map((key) => WEATHER_CONTROLS.find((control) => control.key === key)),
    );

export const WEATHER_CONTROL_GROUPS = Object.freeze([
    Object.freeze({
        id: "clouds",
        name: "Cloud field",
        controls: controlsFor([
            "cloudCoverage",
            "cloudHeight",
            "cloudScale",
            "turbulence",
        ]),
    }),
    Object.freeze({
        id: "air",
        name: "Air & visibility",
        controls: controlsFor([
            "windSpeed",
            "windDirection",
            "gustiness",
            "smokeAmount",
            "fogDensity",
            "visibility",
            "horizonHaze",
            "mistDensity",
            "mistHeight",
            "mistSpeed",
            "atmosphericDesaturation",
        ]),
    }),
    Object.freeze({
        id: "rain",
        name: "Precipitation",
        controls: controlsFor([
            "precipitation",
            "rainDensity",
            "rainSpeed",
            "rainLength",
            "rainAngle",
            "rainDepthDistribution",
            "rainContrast",
            "foregroundRainAmount",
        ]),
    }),
    Object.freeze({
        id: "surface",
        name: "Surface response",
        controls: controlsFor(["wetness", "lightScatter", "dryingRate"]),
    }),
]);

export const WEATHER_QUALITY_MODES = Object.freeze([
    Object.freeze({
        id: "efficient",
        name: "Efficient",
        value: 0,
        maxPixels: 1280 * 720,
    }),
    Object.freeze({
        id: "balanced",
        name: "Balanced",
        value: 1,
        maxPixels: 1920 * 1080,
    }),
    Object.freeze({
        id: "cinematic",
        name: "Cinematic",
        value: 2,
        maxPixels: 2560 * 1440,
    }),
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
    mistSpeed: 1,
    atmosphericDesaturation: 0,
    precipitation: 0,
    rainDensity: 0,
    rainSpeed: 1,
    rainLength: 1,
    rainAngle: 0,
    rainDepthDistribution: 0,
    rainContrast: 0.5,
    foregroundRainAmount: 1,
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
            "mistSpeed",
            "atmosphericDesaturation",
            "precipitation",
            "rainDensity",
            "rainSpeed",
            "rainLength",
            "rainAngle",
            "rainDepthDistribution",
            "rainContrast",
            "foregroundRainAmount",
            "wetness",
            "lightScatter",
            "dryingRate",
        ].includes(key),
    ),
);

const DEFAULT_TRANSITION = Object.freeze({
    motion: Object.freeze({ delay: 0, duration: 4, easing: "easeOut" }),
    cloud: Object.freeze({ delay: 1.5, duration: 8, easing: "smooth" }),
    visibility: Object.freeze({ delay: 3, duration: 9, easing: "smooth" }),
    mist: Object.freeze({ delay: 4.5, duration: 9, easing: "smooth" }),
    precipitation: Object.freeze({ delay: 6, duration: 4, easing: "smooth" }),
    surface: Object.freeze({ delay: 8, duration: 14, easing: "smooth" }),
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
    fogDensity: "visibility",
    visibility: "visibility",
    horizonHaze: "visibility",
    atmosphericDesaturation: "visibility",
    mistDensity: "mist",
    mistHeight: "mist",
    mistSpeed: "mist",
    precipitation: "precipitation",
    rainDensity: "precipitation",
    rainSpeed: "precipitation",
    rainLength: "precipitation",
    rainAngle: "precipitation",
    rainDepthDistribution: "precipitation",
    rainContrast: "precipitation",
    foregroundRainAmount: "precipitation",
    wetness: "surface",
    lightScatter: "surface",
    dryingRate: "surface",
});

function freezeTransition(overrides = {}) {
    return Object.freeze(
        Object.fromEntries(
            Object.entries(DEFAULT_TRANSITION).map(
                ([group, timing]) => [
                    group,
                    Object.freeze({ ...timing, ...(overrides[group] ?? {}) }),
                ],
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
    weatherPreset(
        "clear",
        "Clear",
        {
            cloudCoverage: -0.08,
            cloudHeight: 0.035,
            cloudScale: 0.92,
            turbulence: 0.72,
            windSpeed: 0.55,
            visibility: 1,
            horizonHaze: 0.04,
            dryingRate: 0.2,
        },
        {
            precipitation: { delay: 0, duration: 3, easing: "easeOut" },
            mist: { delay: 2, duration: 7, easing: "smooth" },
            visibility: { delay: 3, duration: 9, easing: "smooth" },
            cloud: { delay: 4, duration: 10, easing: "smooth" },
            surface: { delay: 7, duration: 18, easing: "smooth" },
        },
    ),
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
        mistSpeed: 0.45,
        atmosphericDesaturation: 0.16,
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
        mistSpeed: 0.62,
        atmosphericDesaturation: 0.28,
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
        mistSpeed: 0.78,
        atmosphericDesaturation: 0.34,
        precipitation: 0.34,
        rainDensity: 0.42,
        rainSpeed: 0.82,
        rainLength: 0.62,
        rainAngle: 0.14,
        rainDepthDistribution: -0.18,
        rainContrast: 0.48,
        foregroundRainAmount: 0.56,
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
            mistSpeed: 1.3,
            atmosphericDesaturation: 0.56,
            precipitation: 1,
            rainDensity: 1,
            rainSpeed: 1.72,
            rainLength: 1.48,
            rainAngle: 0.42,
            rainDepthDistribution: 0.18,
            rainContrast: 0.72,
            foregroundRainAmount: 1,
            wetness: 1,
            lightScatter: 0.86,
            dryingRate: 0.04,
        },
        {
            motion: { delay: 0, duration: 5, easing: "easeOut" },
            cloud: { delay: 1.5, duration: 11, easing: "smooth" },
            visibility: { delay: 4, duration: 10, easing: "smooth" },
            mist: { delay: 5.5, duration: 10, easing: "smooth" },
            precipitation: { delay: 7, duration: 6.5, easing: "smooth" },
            surface: { delay: 10, duration: 18, easing: "smooth" },
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
            mistSpeed: 0.88,
            atmosphericDesaturation: 0.12,
            precipitation: 0,
            rainDensity: 0.04,
            rainSpeed: 1.1,
            rainLength: 0.48,
            rainDepthDistribution: -0.1,
            rainContrast: 0.42,
            foregroundRainAmount: 0.34,
            wetness: 0.62,
            lightScatter: 0.22,
            dryingRate: 0.08,
        },
        {
            precipitation: { delay: 0, duration: 3.2, easing: "easeOut" },
            motion: { delay: 1, duration: 5, easing: "easeOut" },
            cloud: { delay: 2, duration: 11, easing: "smooth" },
            mist: { delay: 4, duration: 9, easing: "smooth" },
            visibility: { delay: 5, duration: 10, easing: "smooth" },
            surface: { delay: 9, duration: 24, easing: "smooth" },
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
        ...Object.values(transition).map(
            ({ delay = 0, duration }) => delay + duration,
        ),
    );
}

export function resolveAuthoredWeather(defaultWeatherId = "clear") {
    const preset = WEATHER_PRESETS.find(
        ({ id, state }) => id === defaultWeatherId && state,
    );
    return normalizeState(preset?.state ?? WEATHER_PRESETS[1].state);
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
        this.authoredWeatherId = "clear";
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
        this.transition = preset.id === "scene"
            ? this.getPreset(this.authoredWeatherId).transition
            : preset.transition ?? DEFAULT_TRANSITION;
        this.transitionStart = nowSeconds;
        this.transitioning = true;
        return preset.id;
    }

    setAuthoredWeather(
        defaultWeatherId,
        nowSeconds = performance.now() / 1000,
    ) {
        const preset = this.getPreset(defaultWeatherId);
        const authoredPreset = preset.state ? preset : this.getPreset("clear");
        if (authoredPreset.id === this.authoredWeatherId)
            return this.authoredWeatherId;

        const previousAuthoredState = resolveAuthoredWeather(
            this.authoredWeatherId,
        );
        const resolved = this.update(nowSeconds, previousAuthoredState);
        this.authoredWeatherId = authoredPreset.id;

        if (this.currentId === "scene") {
            this.from = normalizeState(resolved);
            this.current = { ...this.from };
            this.target = null;
            this.transition = authoredPreset.transition ?? DEFAULT_TRANSITION;
            this.transitionStart = nowSeconds;
            this.transitioning = true;
        }
        return this.authoredWeatherId;
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
                const delayedElapsed = elapsed - (timing.delay ?? 0);
                const progress =
                    timing.duration <= 0 ? 1 : delayedElapsed / timing.duration;
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
