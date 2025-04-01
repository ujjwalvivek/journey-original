export class EnvironmentClock {
    constructor() {
        this.travelTime = 0;
        this.windPhase = 0;
        this.foregroundPhase = 0;
        this.smokeLevel = 0;
    }

    advance(
        delta,
        {
            travelRunning = true,
            travelSpeed = 1,
            windSpeed = 1,
            windDirection = 1,
            gust = 0,
        } = {},
    ) {
        const safeDelta = Math.max(0, Math.min(0.1, Number(delta) || 0));
        const safeWindDirection = Math.max(
            -1,
            Math.min(1, Number(windDirection) || 0),
        );
        const safeGust = Math.max(0, Math.min(1, Number(gust) || 0));
        const windRate = Math.max(0, Number(windSpeed) || 0)
            * safeWindDirection
            * (1 + safeGust * 0.65);
        if (travelRunning) {
            this.travelTime += safeDelta * Math.max(0, travelSpeed);
            this.foregroundPhase += safeDelta * Math.max(0, travelSpeed) * 4;
        }
        // Wind remains additive to foreground parallax while travelling and
        // becomes its only motion while holding. Accumulating the signed rate
        // prevents a direction change from scrubbing the cloud field.
        this.foregroundPhase += safeDelta * windRate * 0.06;
        this.windPhase += safeDelta * windRate;
        const smokeTarget = travelRunning ? 1 : 0;
        const smokeRate = travelRunning ? 0.7 : 0.42;
        const smokeStep = safeDelta * smokeRate;
        if (this.smokeLevel < smokeTarget) {
            this.smokeLevel = Math.min(smokeTarget, this.smokeLevel + smokeStep);
        } else {
            this.smokeLevel = Math.max(smokeTarget, this.smokeLevel - smokeStep);
        }
        return safeDelta;
    }

    reset() {
        this.travelTime = 0;
        this.windPhase = 0;
        this.foregroundPhase = 0;
        this.smokeLevel = 0;
    }

}
