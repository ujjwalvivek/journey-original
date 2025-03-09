export const WEATHER_FRONTS = Object.freeze([
    Object.freeze({
        id: "passing-shower",
        name: "Passing shower",
        stages: Object.freeze([
            Object.freeze({ weatherId: "overcast", duration: 24 }),
            Object.freeze({ weatherId: "drizzle", duration: 34 }),
            Object.freeze({ weatherId: "clearing", duration: 38 }),
            Object.freeze({ weatherId: "clear", duration: 30 }),
        ]),
    }),
    Object.freeze({
        id: "monsoon-front",
        name: "Monsoon front",
        stages: Object.freeze([
            Object.freeze({ weatherId: "haze", duration: 20 }),
            Object.freeze({ weatherId: "overcast", duration: 26 }),
            Object.freeze({ weatherId: "monsoon", duration: 48 }),
            Object.freeze({ weatherId: "clearing", duration: 42 }),
        ]),
    }),
    Object.freeze({
        id: "quiet-air",
        name: "Quiet air",
        stages: Object.freeze([
            Object.freeze({ weatherId: "clear", duration: 34 }),
            Object.freeze({ weatherId: "haze", duration: 30 }),
            Object.freeze({ weatherId: "clear", duration: 36 }),
        ]),
    }),
]);

export class WeatherFront {
    constructor(id = WEATHER_FRONTS[0].id) {
        this.enabled = false;
        this.front = WEATHER_FRONTS[0];
        this.stageIndex = 0;
        this.elapsed = 0;
        this.pendingStage = false;
        this.setFront(id);
    }

    get current() {
        return this.front.stages[this.stageIndex];
    }

    setFront(id) {
        this.front =
            WEATHER_FRONTS.find((front) => front.id === id) ??
            WEATHER_FRONTS[0];
        this.stageIndex = 0;
        this.elapsed = 0;
        this.pendingStage = true;
        return this.front.id;
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (this.enabled) this.pendingStage = true;
        return this.enabled;
    }

    next() {
        this.stageIndex = (this.stageIndex + 1) % this.front.stages.length;
        this.elapsed = 0;
        this.pendingStage = true;
        return this.current.weatherId;
    }

    advance(delta) {
        if (!this.enabled) return { changed: false, stage: this.current };
        const safeDelta = Math.max(0, Math.min(0.1, Number(delta) || 0));
        if (this.pendingStage) {
            this.pendingStage = false;
            return { changed: true, stage: this.current };
        }
        this.elapsed += safeDelta;
        if (this.elapsed < this.current.duration)
            return { changed: false, stage: this.current };
        this.elapsed %= this.current.duration;
        this.stageIndex = (this.stageIndex + 1) % this.front.stages.length;
        return { changed: true, stage: this.current };
    }

    getState() {
        return {
            id: this.front.id,
            name: this.front.name,
            enabled: this.enabled,
            stageIndex: this.stageIndex,
            stageCount: this.front.stages.length,
            weatherId: this.current.weatherId,
            progress: Math.min(1, this.elapsed / this.current.duration),
        };
    }
}
