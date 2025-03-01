export class WeatherClock {
    constructor() {
        this.weatherTime = 0;
        this.precipitationTime = 0;
        this.gustTime = 0;
        this.mistTime = 0;
        this.surfaceWetness = 0;
    }

    advance(
        delta,
        {
            weatherSpeed = 1,
            windSpeed = 1,
            gustiness = 0,
            precipitation = 0,
            rainSpeed = 1,
            mistSpeed = 1,
            wetness = 0,
            dryingRate = 0.12,
        } = {},
    ) {
        const safeDelta = Math.max(0, Math.min(0.1, Number(delta) || 0));
        const safeWeatherSpeed = Math.max(0, Number(weatherSpeed) || 0);
        const safeWindSpeed = Math.max(0, Number(windSpeed) || 0);
        this.weatherTime += safeDelta * safeWeatherSpeed;
        // Amount controls how much rain is visible, never how quickly the
        // phase advances. Coupling these made a transitioning storm appear to
        // lag and then repeatedly catch up as precipitation increased.
        this.precipitationTime += safeDelta
            * Math.max(0, Number(rainSpeed) || 0);
        this.gustTime += safeDelta
            * Math.max(0.1, safeWindSpeed)
            * (0.5 + Math.max(0, Number(gustiness) || 0) * 1.5);
        this.mistTime += safeDelta
            * Math.max(0, Number(mistSpeed) || 0)
            * Math.max(0.12, safeWindSpeed * 0.28);
        const precipitationAmount = Math.max(
            0,
            Math.min(1, Number(precipitation) || 0),
        );
        const authoredWetness = Math.max(
            0,
            Math.min(1, Number(wetness) || 0),
        );
        const wetnessTarget = Math.max(
            authoredWetness,
            precipitationAmount * 0.92,
        );
        if (wetnessTarget > this.surfaceWetness) {
            const absorptionRate = 0.32 + precipitationAmount * 1.08;
            const absorption = 1 - Math.exp(-absorptionRate * safeDelta);
            this.surfaceWetness +=
                (wetnessTarget - this.surfaceWetness) * absorption;
        } else {
            const dryStep = Math.max(0, Number(dryingRate) || 0) * safeDelta;
            this.surfaceWetness = Math.max(
                wetnessTarget,
                this.surfaceWetness - dryStep,
            );
        }
        return safeDelta;
    }

    reset() {
        this.weatherTime = 0;
        this.precipitationTime = 0;
        this.gustTime = 0;
        this.mistTime = 0;
        this.surfaceWetness = 0;
    }
}
