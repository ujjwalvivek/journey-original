const clamp01 = (value) => Math.max(0, Math.min(1, value));

export const MOODS = Object.freeze([
    {
        id: "original",
        name: "Original",
        low: [0.16, 0.08, 0.07],
        high: [1.0, 0.76, 0.6],
    },
    {
        id: "ember",
        name: "Ember",
        low: [0.13, 0.025, 0.018],
        high: [1.0, 0.47, 0.16],
    },
    {
        id: "blue-hour",
        name: "Blue Hour",
        low: [0.035, 0.055, 0.15],
        high: [0.56, 0.69, 1.0],
    },
    {
        id: "sakura",
        name: "Sakura",
        low: [0.17, 0.055, 0.1],
        high: [1.0, 0.68, 0.74],
    },
    {
        id: "monsoon",
        name: "Monsoon",
        low: [0.035, 0.1, 0.12],
        high: [0.43, 0.72, 0.69],
    },
    {
        id: "night-rail",
        name: "Night Rail",
        low: [0.025, 0.018, 0.055],
        high: [0.37, 0.34, 0.7],
    },
]);

function smoothstep01(t) {
    const x = clamp01(t);
    return x * x * (3 - 2 * x);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerp3(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export class MoodEngine {
    constructor() {
        this.currentId = "original";
        this.currentLow = [...MOODS[0].low];
        this.currentHigh = [...MOODS[0].high];
        this.fromLow = [...this.currentLow];
        this.fromHigh = [...this.currentHigh];
        this.targetLow = [...this.currentLow];
        this.targetHigh = [...this.currentHigh];
        this.transitionStart = 0;
        this.transitionDuration = 2.4;
        this.intensity = 0;
        this.autoCycle = false;
        this.cycleSeconds = 14;
        this.lastCycle = 0;
    }

    getPreset(id) {
        return MOODS.find((mood) => mood.id === id) ?? MOODS[0];
    }

    setMood(id, nowSeconds = performance.now() / 1000) {
        const preset = this.getPreset(id);
        this.updateTransition(nowSeconds);
        this.currentId = preset.id;
        this.fromLow = [...this.currentLow];
        this.fromHigh = [...this.currentHigh];
        this.targetLow = [...preset.low];
        this.targetHigh = [...preset.high];
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

    next(nowSeconds = performance.now() / 1000) {
        const currentIndex = Math.max(
            0,
            MOODS.findIndex((mood) => mood.id === this.currentId),
        );
        const nextPreset = MOODS[(currentIndex + 1) % MOODS.length];
        this.setMood(nextPreset.id, nowSeconds);
        return nextPreset.id;
    }

    updateTransition(nowSeconds) {
        const elapsed = nowSeconds - this.transitionStart;
        const t =
            this.transitionDuration <= 0
                ? 1
                : smoothstep01(elapsed / this.transitionDuration);
        this.currentLow = lerp3(this.fromLow, this.targetLow, t);
        this.currentHigh = lerp3(this.fromHigh, this.targetHigh, t);
    }

    update(nowSeconds) {
        if (
            this.autoCycle &&
            nowSeconds - this.lastCycle >= this.cycleSeconds
        ) {
            this.next(nowSeconds);
        }

        this.updateTransition(nowSeconds);

        return {
            id: this.currentId,
            low: this.currentLow,
            high: this.currentHigh,
            intensity: this.intensity,
        };
    }
}
