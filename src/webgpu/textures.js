const noiseUrl = new URL("../assets/noise.png", import.meta.url)
    .href;

export async function loadExactNoiseTexture(device) {
    const response = await fetch(noiseUrl);
    if (!response.ok)
        throw new Error(
            `Could not load Shadertoy noise texture (${response.status}).`,
        );

    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob, {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
    });

    if (bitmap.width !== 1024 || bitmap.height !== 1024) {
        bitmap.close();
        throw new Error(
            `Noise texture must be 1024×1024; received ${bitmap.width}×${bitmap.height}.`,
        );
    }

    const texture = device.createTexture({
        label: "exact-noise",
        size: [bitmap.width, bitmap.height, 1],
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Buffer A iChannel0 on the original Shadertoy is configured VFlip ON.
    device.queue.copyExternalImageToTexture(
        { source: bitmap, flipY: true },
        { texture },
        [bitmap.width, bitmap.height],
    );

    bitmap.close();
    return texture;
}
