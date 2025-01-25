export const DEFAULT_MAX_RENDER_PIXELS = 2560 * 1440;

export function fitRenderSize({
    cssWidth,
    cssHeight,
    devicePixelRatio = 1,
    maxDimension = 8192,
    maxPixels = DEFAULT_MAX_RENDER_PIXELS,
}) {
    const safeWidth = Math.max(1, Number(cssWidth) || 1);
    const safeHeight = Math.max(1, Number(cssHeight) || 1);
    const dpr = Math.max(1, Math.min(2, Number(devicePixelRatio) || 1));
    const desiredWidth = safeWidth * dpr;
    const desiredHeight = safeHeight * dpr;
    const dimensionScale = Math.min(
        1,
        maxDimension / desiredWidth,
        maxDimension / desiredHeight,
    );
    const pixelScale = Math.min(
        1,
        Math.sqrt(maxPixels / (desiredWidth * desiredHeight)),
    );
    const budgetScale = Math.min(dimensionScale, pixelScale);

    return {
        width: Math.max(1, Math.floor(desiredWidth * budgetScale)),
        height: Math.max(1, Math.floor(desiredHeight * budgetScale)),
        devicePixelRatio: dpr,
        budgetScale,
    };
}
