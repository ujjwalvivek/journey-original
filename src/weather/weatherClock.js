const clamp = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, Number(value) || 0));

export function resolveGust(gustTime, gustiness) {
    const strength = clamp(gustiness, 0, 1);
    if (strength <= 0) return 0;
    const phase = Math.max(0, Number(gustTime) || 0);
    const wave = 0.5 + 0.5 * Math.sin(
        phase * 1.7 + Math.sin(phase * 0.37) * 1.4,
    );
    return strength * (0.35 + wave * 0.65);
}

export const LIGHTNING_CYCLE_SECONDS = 10;

const lightningHash = (cycle, salt) => {
    const value = Math.sin((cycle + salt) * 91.7) * 43758.5453;
    return value - Math.floor(value);
};

export function resolveLightningEvent(weatherTime, intensity = 0) {
    const strength = clamp(intensity, 0, 1);
    const time = Math.max(0, Number(weatherTime) || 0);
    const cycle = Math.floor(time / LIGHTNING_CYCLE_SECONDS);
    const phase = time - cycle * LIGHTNING_CYCLE_SECONDS;
    const strikeAt = 1.2 + lightningHash(cycle, 17.3) * 6.8;
    const strikeX = 0.16 + lightningHash(cycle, 43.1) * 0.68;
    const distance = phase - strikeAt;
    const primary = Math.exp(-Math.abs(distance) * 32);
    const echo = Math.exp(-Math.abs(distance - 0.18) * 28) * 0.52;
    const afterglow = distance >= 0
        ? Math.exp(-distance * 2.8) * 0.18
        : 0;
    return Object.freeze({
        cycle,
        phase,
        strikeAt,
        strikeX,
        // The recording already has a natural 56 ms lead-in. Scheduling more
        // distance here made a close sheet-lightning event feel disconnected.
        thunderDelay: 0,
        pulse: strength * Math.min(1, primary + echo + afterglow),
    });
}

export class WeatherClock {
    constructor() {
        this.weatherTime = 0;
        this.precipitationTime = 0;
        this.gustTime = 0;
        this.gustValue = 0;
        this.mistTime = 0;
        this.snowTime = 0;
        this.snowCover = 0;
        this.surfaceWetness = 0;
        this.lightningPulse = 0;
        this.lightningEventId = 0;
        this.lightningStrikeX = 0.5;
        this.thunderDelay = 0;
    }

    advance(
        delta,
        {
            weatherSpeed = 1,
            windSpeed = 1,
            windDirection = 1,
            gustiness = 0,
            precipitation = 0,
            snowfall = 0,
            rainSpeed = 1,
            snowSpeed = 0.7,
            snowMeltRate = 0.035,
            lightning = 0,
            mistSpeed = 1,
            wetness = 0,
            dryingRate = 0.12,
        } = {},
    ) {
        const safeDelta = Math.max(0, Math.min(0.1, Number(delta) || 0));
        const safeWeatherSpeed = Math.max(0, Number(weatherSpeed) || 0);
        const safeWindSpeed = Math.max(0, Number(windSpeed) || 0);
        const safeWindDirection = clamp(windDirection, -1, 1);
        const safeGustiness = clamp(gustiness, 0, 1);
        const previousWeatherTime = this.weatherTime;
        this.weatherTime += safeDelta * safeWeatherSpeed;
        // Amount controls how much rain is visible, never how quickly the
        // phase advances. Coupling these made a transitioning storm appear to
        // lag and then repeatedly catch up as precipitation increased.
        this.precipitationTime += safeDelta
            * Math.max(0, Number(rainSpeed) || 0);
        this.snowTime += safeDelta
            * Math.max(0, Number(snowSpeed) || 0);
        const snowfallAmount = clamp(snowfall, 0, 1);
        const snowTarget = Math.min(1, snowfallAmount * 1.25);
        if (snowTarget > this.snowCover) {
            const accumulationRate = 0.18 + snowfallAmount * 0.34;
            const accumulation = 1 - Math.exp(-accumulationRate * safeDelta);
            this.snowCover += (snowTarget - this.snowCover) * accumulation;
        } else {
            const meltRate = Math.max(0, Number(snowMeltRate) || 0);
            const remaining = Math.exp(-meltRate * safeDelta);
            this.snowCover = snowTarget +
                (this.snowCover - snowTarget) * remaining;
        }
        this.gustTime += safeDelta
            * Math.max(0.1, safeWindSpeed)
            * (0.5 + safeGustiness * 1.5);
        this.gustValue = resolveGust(this.gustTime, safeGustiness);
        const previousLightning = resolveLightningEvent(
            previousWeatherTime,
            lightning,
        );
        const currentLightning = resolveLightningEvent(
            this.weatherTime,
            lightning,
        );
        this.lightningPulse = currentLightning.pulse;
        const crossedStrike =
            safeDelta > 0 &&
            currentLightning.cycle === previousLightning.cycle &&
            previousLightning.phase < currentLightning.strikeAt &&
            currentLightning.phase >= currentLightning.strikeAt &&
            clamp(lightning, 0, 1) > 0;
        if (crossedStrike) {
            this.lightningEventId += 1;
            this.lightningStrikeX = currentLightning.strikeX;
            this.thunderDelay = currentLightning.thunderDelay;
        }
        this.mistTime += safeDelta
            * Math.max(0, Number(mistSpeed) || 0)
            * Math.max(0.12, safeWindSpeed * 0.28)
            * safeWindDirection
            * (1 + this.gustValue * 0.65);
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
        this.gustValue = 0;
        this.mistTime = 0;
        this.snowTime = 0;
        this.snowCover = 0;
        this.surfaceWetness = 0;
        this.lightningPulse = 0;
        this.lightningEventId = 0;
        this.lightningStrikeX = 0.5;
        this.thunderDelay = 0;
    }
}
