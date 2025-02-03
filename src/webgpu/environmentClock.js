export class EnvironmentClock {
    constructor() {
        this.travelTime = 0;
        this.windPhase = 0;
        this.foregroundPhase = 0;
    }

    advance(
        delta,
        {
            travelRunning = true,
            travelSpeed = 1,
            windSpeed = 1,
        } = {},
    ) {
        const safeDelta = Math.max(0, Math.min(0.1, Number(delta) || 0));
        if (travelRunning) {
            this.travelTime += safeDelta * Math.max(0, travelSpeed);
            this.foregroundPhase += safeDelta * Math.max(0, travelSpeed) * 4;
        } else {
            // While the train is holding, the nearest cloud field falls back
            // to the distant layer's screen-space wind speed (its time phase
            // is divided by ten inside the background shader).
            this.foregroundPhase += safeDelta * Math.max(0, windSpeed) * 0.06;
        }
        this.windPhase += safeDelta * Math.max(0, windSpeed);
        return safeDelta;
    }

    reset() {
        this.travelTime = 0;
        this.windPhase = 0;
        this.foregroundPhase = 0;
    }
}
