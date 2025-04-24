export function advanceSimulationClocks(
    environmentClock,
    weatherClock,
    delta,
    {
        weatherFrozen = false,
        travelRunning = true,
        travelSpeed = 1,
        weather = {},
    } = {},
) {
    weatherClock.advance(weatherFrozen ? 0 : delta, weather);
    environmentClock.advance(delta, {
        travelRunning,
        travelSpeed,
        windSpeed: weather.windSpeed,
        windDirection: weather.windDirection,
        gust: weatherClock.gustValue,
    });
    return {
        travelTime: environmentClock.travelTime,
        windPhase: environmentClock.windPhase,
        foregroundPhase: environmentClock.foregroundPhase,
        motionLevel: environmentClock.motionLevel,
        smokeLevel: environmentClock.smokeLevel,
        weatherTime: weatherClock.weatherTime,
        precipitationTime: weatherClock.precipitationTime,
        gustTime: weatherClock.gustTime,
        gustValue: weatherClock.gustValue,
        mistTime: weatherClock.mistTime,
        surfaceWetness: weatherClock.surfaceWetness,
    };
}
