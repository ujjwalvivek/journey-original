export class EnvironmentClock {
    constructor() {
        this.travelTime = 0;
        this.windPhase = 0;
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
        }
        this.windPhase += safeDelta * Math.max(0, windSpeed);
        return safeDelta;
    }

    reset() {
        this.travelTime = 0;
        this.windPhase = 0;
    }
}
