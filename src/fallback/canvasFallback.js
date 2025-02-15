const TAU = Math.PI * 2;
const MOTION = {
    bridgeArrivalEnd: 0.58,
    bridgeTravelSpeed: 0.29,
    bridgeTravelRamp: 0.46,
    trainArrivalStart: 0.46,
    trainArrivalEnd: 1.42,
    backgroundDrift: 0.000032,
    foregroundDrift: 0.0019,
    wheelRotation: 0.017,
    smokeCycle: 0.00034,
};
const CLOUD_PALETTE = [
    [143, 109, 99],
    [226, 154, 103],
    [240, 168, 115],
    [209, 135, 88],
    [183, 108, 69],
    [145, 80, 59],
    [103, 57, 52],
];
const FOREGROUND_PALETTE = [
    [209, 135, 88],
    [183, 108, 69],
    [145, 80, 59],
    [103, 57, 52],
];
function smoothstep(edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function easeOutCubic(value) {
    return 1 - (1 - value) ** 3;
}

function easeOutBack(value) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (value - 1) ** 3 + c1 * (value - 1) ** 2;
}

function hash2(x, y) {
    let value = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function noise2(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const top = hash2(ix, iy) * (1 - ux) + hash2(ix + 1, iy) * ux;
    const bottom = hash2(ix, iy + 1) * (1 - ux) + hash2(ix + 1, iy + 1) * ux;
    return top * (1 - uy) + bottom * uy;
}

function cloudField(x, y) {
    return (
        noise2(x, y) * 0.52 +
        noise2(x * 2.03 + 7.4, y * 2.03 + 2.1) * 0.29 +
        noise2(x * 4.11 + 1.7, y * 4.11 + 9.3) * 0.13 +
        noise2(x * 8.17 + 5.2, y * 8.17 + 3.8) * 0.06
    );
}

function buildWeatherLayer(canvas, width, height, drift) {
    const pixelWidth = Math.max(160, Math.min(320, Math.round(width / 6)));
    const pixelHeight = Math.max(90, Math.round((pixelWidth * height) / width));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    const image = context.createImageData(pixelWidth, pixelHeight);
    const data = image.data;
    const aspect = pixelWidth / pixelHeight;

    for (let y = 0; y < pixelHeight; y += 1) {
        for (let x = 0; x < pixelWidth; x += 1) {
            const nx = (x / pixelWidth) * 4.2 * aspect + drift;
            const ny = (y / pixelHeight) * 4.6;
            const broad = cloudField(nx * 0.72, ny * 0.72);
            const folded = cloudField(nx * 1.12 + 12.7, ny * 1.12 + 4.4);
            const value =
                broad * 0.72 + folded * 0.28 + (y / pixelHeight) * 0.055;
            const level = Math.max(
                0,
                Math.min(
                    CLOUD_PALETTE.length - 1,
                    Math.floor((value - 0.24) * 10.2),
                ),
            );
            const color = CLOUD_PALETTE[level];
            const index = (y * pixelWidth + x) * 4;
            data[index] = color[0];
            data[index + 1] = color[1];
            data[index + 2] = color[2];
            data[index + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
}

function drawBridge(ctx, width, height, elapsed) {
    const deckY = height * 0.705;
    const towerTop = height * 0.62;
    const towerWidth = Math.max(9, width * 0.0075);
    const span = height / 3;
    const journeyAge = Math.max(0, elapsed / 1000 - MOTION.bridgeArrivalEnd);
    const travelRamp = smoothstep(0, MOTION.bridgeTravelRamp, journeyAge);
    const travelOffset =
        (journeyAge * travelRamp * height * MOTION.bridgeTravelSpeed) % span;
    const firstTower = -span - travelOffset;
    const towerCount = Math.ceil(width / span) + 3;
    const ink = "#2d1a19";

    ctx.save();
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineCap = "square";
    ctx.lineJoin = "round";

    for (let tower = 0; tower < towerCount; tower += 1) {
        const towerX = firstTower + tower * span;
        ctx.fillRect(
            towerX - towerWidth / 2,
            towerTop,
            towerWidth,
            deckY - towerTop + height * 0.025,
        );
        if (tower < towerCount - 1) {
            ctx.lineWidth = Math.max(4, height * 0.005);
            ctx.beginPath();
            ctx.moveTo(towerX, towerTop + height * 0.012);
            ctx.quadraticCurveTo(
                towerX + span / 2,
                deckY - height * 0.014,
                towerX + span,
                towerTop + height * 0.012,
            );
            ctx.stroke();

            ctx.lineWidth = Math.max(1.5, height * 0.002);
            const hangerGap = span / 8;
            for (let hanger = 1; hanger < 8; hanger += 1) {
                const local = hanger / 8;
                const x = towerX + hangerGap * hanger;
                const cableStartY = towerTop + height * 0.012;
                const cableControlY = deckY - height * 0.014;
                const cableY =
                    cableStartY +
                    2 * local * (1 - local) * (cableControlY - cableStartY);
                ctx.beginPath();
                ctx.moveTo(x, cableY);
                ctx.lineTo(x, deckY);
                ctx.stroke();
            }
        }

        if (tower > 0 && tower < towerCount - 1) {
            const pierWidth = Math.max(11, width * 0.009);
            ctx.fillRect(
                towerX - pierWidth / 2,
                deckY,
                pierWidth,
                height - deckY,
            );
        }
    }

    ctx.fillRect(0, deckY, width, Math.max(9, height * 0.013));
    ctx.fillRect(0, deckY + height * 0.017, width, Math.max(4, height * 0.005));
    ctx.restore();
    return deckY;
}

function glowRect(ctx, x, y, width, height, blur = 8) {
    ctx.save();
    ctx.fillStyle = "#ffd094";
    ctx.shadowColor = "#ff8147";
    ctx.shadowBlur = blur;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
}

function drawWheel(ctx, x, y, radius, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = "#171014";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(231,121,73,.5)";
    ctx.lineWidth = Math.max(1, radius * 0.12);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.5, 0);
    ctx.lineTo(radius * 0.5, 0);
    ctx.stroke();
    ctx.restore();
}

function buildForegroundLayer(canvas, width, height, drift) {
    const pixelWidth = Math.max(160, Math.min(320, Math.round(width / 6)));
    const pixelHeight = Math.max(90, Math.round((pixelWidth * height) / width));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }
    const context = canvas.getContext("2d");
    const image = context.createImageData(pixelWidth, pixelHeight);
    const data = image.data;
    const aspect = pixelWidth / pixelHeight;

    for (let y = 0; y < pixelHeight; y += 1) {
        const yRatio = y / pixelHeight;
        for (let x = 0; x < pixelWidth; x += 1) {
            const nx = (x / pixelWidth) * 7.8 * aspect + drift;
            const broadMounds = noise2(nx * 0.38 + 4.7, 12.8) ** 1.25;
            const edgeNoise =
                broadMounds * 0.58 +
                noise2(nx * 1.25 + 1.2, 28.4) * 0.29 +
                noise2(nx * 3.4 + 8.6, 6.3) * 0.13;
            const edge = 0.91 - edgeNoise * 0.18;
            const index = (y * pixelWidth + x) * 4;
            if (yRatio < edge) {
                data[index + 3] = 0;
                continue;
            }

            const detail = cloudField(nx * 0.48 + 16.3, yRatio * 3.2 + 6.1);
            const depth = Math.min(
                1,
                (yRatio - edge) / Math.max(0.001, 1 - edge),
            );
            const tone = detail * 0.62 + depth * 0.38;
            let color =
                tone < 0.43
                    ? FOREGROUND_PALETTE[0]
                    : tone < 0.53
                      ? FOREGROUND_PALETTE[1]
                      : tone < 0.64
                        ? FOREGROUND_PALETTE[2]
                        : FOREGROUND_PALETTE[3];
            if (yRatio - edge < 0.018) color = FOREGROUND_PALETTE[3];
            data[index] = color[0];
            data[index + 1] = color[1];
            data[index + 2] = color[2];
            data[index + 3] = 246;
        }
    }
    context.putImageData(image, 0, 0);
}

function drawSmoke(ctx, chimneyX, chimneyY, elapsed, bodyHeight) {
    ctx.save();
    const presence = ctx.globalAlpha;
    for (let plume = 0; plume < 6; plume += 1) {
        const age = (elapsed * MOTION.smokeCycle + plume / 6) % 1;
        const radius = bodyHeight * (0.2 + age * 0.55);
        const x = chimneyX - age * bodyHeight * 4.4;
        const y =
            chimneyY -
            age * bodyHeight * 1.2 +
            Math.sin(age * 9 + plume) * bodyHeight * 0.08;
        ctx.globalAlpha = presence * (1 - age) * 0.36;
        ctx.fillStyle = age > 0.48 ? "#8f6d63" : "#673934";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fill();
    }
    ctx.restore();
}

function drawTrain(ctx, width, height, deckY, elapsed) {
    const trainWidth = height * 0.5;
    const sceneAge = elapsed / 1000;
    const arrival = easeOutCubic(
        smoothstep(MOTION.trainArrivalStart, MOTION.trainArrivalEnd, sceneAge),
    );
    const x = -(1 - arrival) * height * 0.72;
    const bodyHeight = Math.max(8, height * 0.012);
    const baseY = deckY - Math.max(6, height * 0.007);
    const gap = Math.max(3, height * 0.005);
    const engineWidth = trainWidth * 0.1;
    const wagonWidth = (trainWidth - engineWidth - gap * 4) / 4;
    const wheelRadius = Math.max(4.5, height * 0.0065);
    const ink = "#241617";
    const rotation = elapsed * MOTION.wheelRotation;

    ctx.save();
    ctx.globalAlpha = smoothstep(0.02, 0.12, arrival);
    for (let wagon = 0; wagon < 4; wagon += 1) {
        const wagonX = x + wagon * (wagonWidth + gap);
        ctx.fillStyle = ink;
        ctx.fillRect(wagonX, baseY - bodyHeight, wagonWidth, bodyHeight);
        ctx.fillStyle = "#151014";
        ctx.fillRect(wagonX, baseY - bodyHeight - 3, wagonWidth, 4);
        ctx.fillStyle = "#e98955";
        ctx.fillRect(wagonX + 2, baseY - bodyHeight - 2, wagonWidth - 4, 1.5);
        const windowSize = Math.max(4, bodyHeight * 0.25);
        for (let light = 0; light < 3; light += 1) {
            ctx.fillStyle = "#ffc27c";
            ctx.fillRect(
                wagonX + wagonWidth * (0.25 + light * 0.25) - windowSize / 2,
                baseY - bodyHeight * 0.62,
                windowSize,
                windowSize * 0.75,
            );
        }
        drawWheel(
            ctx,
            wagonX + wagonWidth * 0.22,
            baseY,
            wheelRadius,
            rotation,
        );
        drawWheel(
            ctx,
            wagonX + wagonWidth * 0.78,
            baseY,
            wheelRadius,
            rotation,
        );
    }

    const engineX = x + 4 * (wagonWidth + gap);
    ctx.fillStyle = ink;
    const cabWidth = engineWidth * 0.54;
    ctx.fillRect(
        engineX,
        baseY - bodyHeight * 1.22,
        cabWidth,
        bodyHeight * 1.22,
    );
    ctx.fillRect(
        engineX + cabWidth,
        baseY - bodyHeight * 0.72,
        engineWidth - cabWidth,
        bodyHeight * 0.72,
    );
    ctx.fillStyle = "#151014";
    ctx.fillRect(engineX - 2, baseY - bodyHeight * 1.22 - 3, cabWidth + 4, 4);
    ctx.fillStyle = "#ffc27c";
    ctx.fillRect(
        engineX + cabWidth * 0.28,
        baseY - bodyHeight * 0.94,
        bodyHeight * 0.25,
        bodyHeight * 0.23,
    );
    const chimneyX = engineX + engineWidth * 0.72;
    const chimneyY = baseY - bodyHeight * 1.16;
    ctx.fillStyle = ink;
    ctx.fillRect(
        chimneyX - engineWidth * 0.045,
        chimneyY,
        engineWidth * 0.09,
        bodyHeight * 0.47,
    );
    ctx.fillRect(
        chimneyX - engineWidth * 0.065,
        chimneyY - 3,
        engineWidth * 0.13,
        4,
    );
    ctx.fillRect(
        engineX + engineWidth * 0.93,
        baseY - bodyHeight * 0.87,
        engineWidth * 0.07,
        bodyHeight * 0.24,
    );
    glowRect(
        ctx,
        engineX + engineWidth * 0.95,
        baseY - bodyHeight * 0.8,
        bodyHeight * 0.17,
        bodyHeight * 0.17,
        8,
    );
    drawSmoke(ctx, chimneyX, chimneyY, elapsed, bodyHeight);
    drawWheel(ctx, engineX + engineWidth * 0.23, baseY, wheelRadius, rotation);
    drawWheel(
        ctx,
        engineX + engineWidth * 0.7,
        baseY,
        wheelRadius * 1.08,
        rotation,
    );
    ctx.restore();
}

export function mountCanvasFallback(canvas) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return () => {};
    const weatherCanvas = document.createElement("canvas");
    const foregroundCanvas = document.createElement("canvas");
    let destroyed = false;
    let frame = 0;
    let lastWeatherFrame = -1;
    let originTime = null;

    function resize() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.max(1, canvas.clientWidth);
        const height = Math.max(1, canvas.clientHeight);
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        lastWeatherFrame = -1;
    }

    function draw(time) {
        if (destroyed) return;
        if (originTime === null) originTime = time;
        const elapsed = time - originTime;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const weatherFrame = Math.floor(elapsed / (1000 / 60));
        if (weatherFrame !== lastWeatherFrame) {
            buildWeatherLayer(
                weatherCanvas,
                width,
                height,
                elapsed * MOTION.backgroundDrift,
            );
            buildForegroundLayer(
                foregroundCanvas,
                width,
                height,
                elapsed * MOTION.foregroundDrift,
            );
            lastWeatherFrame = weatherFrame;
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(weatherCanvas, 0, 0, width, height);

        const sceneAge = elapsed / 1000;
        const bridgeArrival = easeOutBack(
            smoothstep(0.02, MOTION.bridgeArrivalEnd, sceneAge),
        );
        const bridgeOffset = (1 - bridgeArrival) * height * 0.48;
        ctx.save();
        ctx.translate(0, bridgeOffset);
        const deckY = drawBridge(ctx, width, height, elapsed);
        drawTrain(ctx, width, height, deckY, elapsed);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.filter = `brightness(.32) blur(${Math.max(3, height * 0.004)}px)`;
        ctx.drawImage(foregroundCanvas, 0, -height * 0.008, width, height);
        ctx.restore();
        ctx.drawImage(foregroundCanvas, 0, 0, width, height);

        const vignette = ctx.createRadialGradient(
            width / 2,
            height * 0.45,
            height * 0.2,
            width / 2,
            height * 0.45,
            Math.max(width, height) * 0.75,
        );
        vignette.addColorStop(0, "rgba(0,0,0,0)");
        vignette.addColorStop(1, "rgba(35,20,19,.25)");
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
        frame = requestAnimationFrame(draw);
    }

    resize();
    const observer =
        typeof ResizeObserver === "undefined"
            ? null
            : new ResizeObserver(resize);
    observer?.observe(canvas);
    window.addEventListener("resize", resize);
    frame = requestAnimationFrame(draw);
    return () => {
        destroyed = true;
        cancelAnimationFrame(frame);
        observer?.disconnect();
        window.removeEventListener("resize", resize);
    };
}
