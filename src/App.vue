<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { JourneyRenderer } from "./webgpu/renderer.js";
import { mountCanvasFallback } from "./fallback/canvasFallback.js";
import {
    AUTHORING_COLORS,
    AUTHORING_CONTROLS,
    MOODS,
} from "./webgpu/moodEngine.js";
import {
    LEGACY_WEATHER_KEYS,
    RENDERED_WEATHER_CONTROLS,
    WEATHER_CONTROL_GROUPS,
    WEATHER_CONTROLS,
    WEATHER_PRESETS,
    WEATHER_QUALITY_MODES,
} from "./weather/weatherEngine.js";
import { WEATHER_FRONTS } from "./weather/weatherFront.js";

const MOOD_ONLY_CONTROLS = AUTHORING_CONTROLS.filter(
    ({ key }) => !LEGACY_WEATHER_KEYS.includes(key),
);

const canvas = ref(null);
const fallbackCanvas = ref(null);
const fallbackPreview = ref(false);
const state = ref("loading");
const message = ref("Starting WebGPU…");
const hudVisible = ref(true);
const railCanReveal = ref(true);
const activePanel = ref(null);
const travelRunning = ref(true);
const travelSpeed = ref(1);
const moodId = ref("departure");
const sceneMenuOpen = ref(false);
const weatherId = ref("scene");
const authoredWeatherId = ref("clear");
const weatherMenuOpen = ref(false);
const weatherFrontMenuOpen = ref(false);
const weatherFrontId = ref(WEATHER_FRONTS[0].id);
const weatherFrontEnabled = ref(false);
const weatherFrozen = ref(false);
const weatherQuality = ref("cinematic");
const weatherFrontProgress = ref(0);
const weatherFrontStage = ref("scene");
const surfaceWetness = ref(0);
const labMode = ref("weather");
const moodIntensity = ref(1);
const autoMood = ref(false);
const feedbackAmount = ref(0.3);
const vignetteStrength = ref(1);
const fps = ref(0);
const renderSize = ref("-");
const renderScale = ref(1);
const travelTime = ref(0);
const weatherTime = ref(0);
const cueId = ref("departure");
const cueProgress = ref(0);
const authoringValues = ref({});
const authoringColors = ref({});
const weatherValues = ref({});
const copyStatus = ref("COPY STATE");
const capturePhase = ref("idle");
const captureUrl = ref("");
const captureFilename = ref("");
const captureGeometry = ref({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    padding: 0,
    footer: 0,
});
const captureButton = ref(null);
const captureDownloadButton = ref(null);

let renderer = null;
let statsTimer = 0;
let destroyFallback = null;

const travelLabel = computed(() =>
    travelRunning.value ? "STOP TRAIN" : "START TRAIN",
);
const statusLabel = computed(() =>
    travelRunning.value ? "IN MOTION" : "HOLDING",
);
const selectedMoodName = computed(
    () => MOODS.find((mood) => mood.id === moodId.value)?.name ?? "-",
);
const selectedWeatherName = computed(() => {
    const selected = WEATHER_PRESETS.find(
        (weather) => weather.id === weatherId.value,
    )?.name ?? "-";
    if (weatherId.value !== "scene") return selected;
    const authored = WEATHER_PRESETS.find(
        (weather) => weather.id === authoredWeatherId.value,
    )?.name ?? "-";
    return `${selected} · ${authored}`;
});
const selectedWeatherFrontName = computed(
    () =>
        WEATHER_FRONTS.find((front) => front.id === weatherFrontId.value)?.name ??
        "-",
);
const captureActive = computed(() => capturePhase.value !== "idle");
const captureStyle = computed(() => ({
    "--capture-left": `${captureGeometry.value.left}px`,
    "--capture-top": `${captureGeometry.value.top}px`,
    "--capture-width": `${captureGeometry.value.width}px`,
    "--capture-height": `${captureGeometry.value.height}px`,
    "--capture-padding": `${captureGeometry.value.padding}px`,
    "--capture-footer": `${captureGeometry.value.footer}px`,
}));

function toggleTravel() {
    travelRunning.value = !travelRunning.value;
    renderer?.setTravelRunning(travelRunning.value);
}

function resetJourney() {
    renderer?.resetJourney();
}

function nextMood() {
    autoMood.value = false;
    const next = renderer?.nextMood();
    if (next) moodId.value = next;
}

function togglePanel(panel) {
    sceneMenuOpen.value = false;
    weatherMenuOpen.value = false;
    weatherFrontMenuOpen.value = false;
    hudVisible.value = true;
    activePanel.value = activePanel.value === panel ? null : panel;
}

function hideHud(event) {
    hudVisible.value = false;
    railCanReveal.value = !event;
    activePanel.value = null;
    sceneMenuOpen.value = false;
    weatherMenuOpen.value = false;
    weatherFrontMenuOpen.value = false;
    event?.currentTarget?.blur();
}

function selectScene(id) {
    autoMood.value = false;
    moodId.value = id;
    sceneMenuOpen.value = false;
}

function selectWeather(id) {
    weatherFrontEnabled.value = false;
    weatherId.value = id;
    weatherMenuOpen.value = false;
}

function selectWeatherFront(id) {
    weatherFrontId.value = id;
    weatherFrontEnabled.value = true;
    weatherFrontMenuOpen.value = false;
}

function nextWeatherFrontStage() {
    weatherFrontEnabled.value = true;
    renderer?.nextWeatherFrontStage();
}

function closeSceneMenu(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        sceneMenuOpen.value = false;
    }
}

function closeWeatherMenu(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        weatherMenuOpen.value = false;
    }
}

function closeWeatherFrontMenu(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        weatherFrontMenuOpen.value = false;
    }
}

function updateCaptureGeometry() {
    if (!captureUrl.value || !canvas.value) return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const ratio = canvas.value.width / Math.max(1, canvas.value.height);
    const padding = Math.max(12, Math.min(28, viewportWidth * 0.018));
    const footer = Math.max(70, Math.min(124, viewportHeight * 0.105));
    const maximumOuterWidth = Math.min(viewportWidth * 0.86, 1180);
    const maximumOuterHeight = viewportHeight * 0.88;
    const maximumImageWidth = Math.max(1, maximumOuterWidth - padding * 2);
    const maximumImageHeight = Math.max(
        1,
        maximumOuterHeight - padding - footer,
    );
    const imageWidth = Math.min(
        maximumImageWidth,
        maximumImageHeight * ratio,
    );
    const imageHeight = imageWidth / ratio;
    const width = imageWidth + padding * 2;
    const height = imageHeight + padding + footer;
    captureGeometry.value = {
        left: (viewportWidth - width) / 2,
        top: (viewportHeight - height) / 2,
        width,
        height,
        padding,
        footer,
    };
}

function clearCapture() {
    if (captureUrl.value) URL.revokeObjectURL(captureUrl.value);
    captureUrl.value = "";
    captureFilename.value = "";
    capturePhase.value = "idle";
}

async function captureStill() {
    if (!renderer || captureActive.value || state.value !== "ready") return;
    capturePhase.value = "capturing";
    renderer.pausePresentation();
    let pendingUrl = "";
    try {
        const blob = await renderer.capturePng();
        pendingUrl = URL.createObjectURL(blob);
        const preview = new Image();
        preview.src = pendingUrl;
        try {
            await preview.decode();
        } catch {
            // The decoded image is an animation nicety; the Blob URL remains
            // a valid fallback on browsers without decode() support.
        }
        const bitmap = await createImageBitmap(blob);
        renderer.setCaptureImage(bitmap);
        bitmap.close();
        captureUrl.value = pendingUrl;
        pendingUrl = "";
        captureFilename.value = `journey-${Date.now()}.png`;
        updateCaptureGeometry();
        capturePhase.value = "opening";
        await nextTick();
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                if (capturePhase.value !== "opening") return;
                capturePhase.value = "review";
                captureDownloadButton.value?.focus({ preventScroll: true });
            });
        });
    } catch (error) {
        console.error(error);
        if (pendingUrl) URL.revokeObjectURL(pendingUrl);
        clearCapture();
        renderer.resumePresentation();
    }
}

function downloadCapture() {
    if (!captureUrl.value) return;
    const link = document.createElement("a");
    link.href = captureUrl.value;
    link.download = captureFilename.value;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
}

function continueJourney() {
    if (capturePhase.value !== "review") return;
    const viewportWidth = Math.max(1, window.innerWidth);
    const viewportHeight = Math.max(1, window.innerHeight);
    const geometry = captureGeometry.value;
    capturePhase.value = "handoff";
    renderer?.beginCaptureTransition(
        {
            rect: [
                geometry.left / viewportWidth,
                geometry.top / viewportHeight,
                geometry.width / viewportWidth,
                geometry.height / viewportHeight,
            ],
            frame: [
                geometry.padding / viewportWidth,
                geometry.padding / viewportHeight,
                geometry.footer / viewportHeight,
                (-0.32 * Math.PI) / 180,
            ],
            duration: 0.5,
        },
        {
            onStarted: () => {
                if (capturePhase.value === "handoff")
                    capturePhase.value = "gpu-closing";
            },
            onComplete: finishCaptureTransition,
        },
    );
    renderer?.resumePresentation();
}

function finishCaptureTransition() {
    if (!captureActive.value) return;
    clearCapture();
    nextTick(() => captureButton.value?.focus({ preventScroll: true }));
}

async function showRendererError(error) {
    state.value = "error";
    message.value = error instanceof Error ? error.message : String(error);
    await nextTick();
    destroyFallback?.();
    destroyFallback = mountCanvasFallback(fallbackCanvas.value);
}

async function setFallbackPreview(visible) {
    fallbackPreview.value = Boolean(visible);
    await nextTick();
    destroyFallback?.();
    destroyFallback = fallbackPreview.value
        ? mountCanvasFallback(fallbackCanvas.value)
        : null;
}

function overrideMood(key, value) {
    renderer?.setMoodOverride(key, value);
}

function overrideWeather(key, value) {
    renderer?.setWeatherOverride(key, value);
}

function colorToHex(color) {
    if (!Array.isArray(color)) return "#000000";
    return `#${color
        .map((channel) =>
            Math.round(Math.max(0, Math.min(1, channel)) * 255)
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;
}

function hexToColor(hex) {
    const value = hex.replace("#", "");
    return [0, 2, 4].map(
        (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
    );
}

function overrideMoodColor(key, value) {
    renderer?.setMoodOverride(key, hexToColor(value));
}

function clearMoodOverrides() {
    renderer?.clearMoodOverrides();
}

function resetToAuthoredWeather() {
    if (!renderer) return;
    renderer.resetToAuthoredWeather();
    weatherFrontEnabled.value = false;
    weatherFrozen.value = false;
    weatherId.value = "scene";
}

async function copyMoodState() {
    const stats = renderer?.getStats();
    const mood = stats?.mood;
    if (!mood) return;
    const snapshot = {
        id: mood.id,
        low: mood.low.map((value) => Number(value.toFixed(4))),
        high: mood.high.map((value) => Number(value.toFixed(4))),
        colors: Object.fromEntries(
            AUTHORING_COLORS.filter(
                ({ key }) => key !== "low" && key !== "high",
            ).map(({ key }) => [
                key,
                mood[key].map((value) => Number(value.toFixed(4))),
            ]),
        ),
        world: Object.fromEntries(
            MOOD_ONLY_CONTROLS.map(({ key }) => [
                key,
                Number(mood[key].toFixed(4)),
            ]),
        ),
        weather: {
            id: stats.weatherId,
            authoredDefaultId: stats.authoredWeatherId,
            front: stats.weatherFront,
            frozen: stats.weatherFrozen,
            quality: stats.weatherQuality,
            surfaceWetness: Number(stats.surfaceWetness.toFixed(4)),
            state: Object.fromEntries(
                WEATHER_CONTROLS.map(({ key }) => [
                    key,
                    Number(stats.weather[key].toFixed(4)),
                ]),
            ),
        },
    };

    try {
        await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
        copyStatus.value = "COPIED";
    } catch {
        copyStatus.value = "COPY FAILED";
    }
    window.setTimeout(() => (copyStatus.value = "COPY STATE"), 1400);
}

function onKeydown(event) {
    if (captureActive.value) {
        if (event.key === "Escape" && capturePhase.value === "review") {
            event.preventDefault();
            continueJourney();
        }
        return;
    }
    if (
        event.target instanceof Element &&
        event.target.closest(
            "button, input, select, textarea, [contenteditable='true']",
        )
    )
        return;
    if (event.code === "Space") {
        event.preventDefault();
        toggleTravel();
    } else if (event.key.toLowerCase() === "m") {
        nextMood();
    } else if (event.key.toLowerCase() === "h") {
        if (hudVisible.value) hideHud();
        else hudVisible.value = true;
    } else if (event.key.toLowerCase() === "r") {
        resetJourney();
    } else if (event.key === "Escape") {
        if (fallbackPreview.value && state.value !== "error") {
            setFallbackPreview(false);
        }
        sceneMenuOpen.value = false;
        weatherMenuOpen.value = false;
        weatherFrontMenuOpen.value = false;
        activePanel.value = null;
    }
}

watch(travelSpeed, (value) => renderer?.setTravelSpeed(value));
watch(moodId, (value) => {
    if (renderer?.getStats().moodId !== value) renderer?.setMood(value);
});
watch(moodIntensity, (value) => renderer?.setMoodIntensity(value));
watch(weatherId, (value) => {
    if (renderer?.getStats().weatherId !== value) renderer?.setWeather(value);
});
watch(weatherFrontId, (value) => renderer?.setWeatherFront(value));
watch(weatherFrontEnabled, (value) => renderer?.setWeatherFrontEnabled(value));
watch(weatherFrozen, (value) => renderer?.setWeatherFrozen(value));
watch(weatherQuality, (value) => renderer?.setWeatherQuality(value));
watch(autoMood, (value) => renderer?.setAutoMood(value));
watch(feedbackAmount, (value) => renderer?.setFeedbackAmount(value));
watch(vignetteStrength, (value) => renderer?.setVignetteStrength(value));

onMounted(async () => {
    try {
        if (!navigator.gpu) {
            await showRendererError(
                "WebGPU is unavailable in this browser or has been disabled.",
            );
            return;
        }

        renderer = new JourneyRenderer(canvas.value, {
            onFatalError(error) {
                showRendererError(error);
            },
        });
        await renderer.init();
        renderer.setTravelRunning(travelRunning.value);
        renderer.setTravelSpeed(travelSpeed.value);
        renderer.setMood(moodId.value);
        renderer.setMoodIntensity(moodIntensity.value);
        renderer.setWeather(weatherId.value);
        renderer.setWeatherFront(weatherFrontId.value);
        renderer.setWeatherFrontEnabled(weatherFrontEnabled.value);
        renderer.setWeatherFrozen(weatherFrozen.value);
        renderer.setWeatherQuality(weatherQuality.value);
        renderer.setAutoMood(autoMood.value);
        renderer.setFeedbackAmount(feedbackAmount.value);
        renderer.setVignetteStrength(vignetteStrength.value);
        renderer.startRenderer();
        state.value = "ready";

        statsTimer = window.setInterval(() => {
            const stats = renderer?.getStats();
            if (!stats) return;
            fps.value = stats.fps;
            renderSize.value = `${stats.width}×${stats.height}`;
            renderScale.value = stats.renderBudgetScale;
            travelTime.value = stats.travelTime;
            weatherTime.value = stats.weatherTime;
            surfaceWetness.value = stats.surfaceWetness;
            weatherFrozen.value = stats.weatherFrozen;
            weatherQuality.value = stats.weatherQuality;
            weatherFrontEnabled.value = stats.weatherFront.enabled;
            weatherFrontId.value = stats.weatherFront.id;
            weatherFrontProgress.value = stats.weatherFront.progress;
            weatherFrontStage.value = stats.weatherFront.weatherId;
            authoredWeatherId.value = stats.authoredWeatherId;
            cueId.value = stats.cueId;
            cueProgress.value = stats.cueProgress;
            travelRunning.value = stats.travelRunning;
            authoringValues.value = Object.fromEntries(
                MOOD_ONLY_CONTROLS.map(({ key }) => [key, stats.mood[key]]),
            );
            weatherValues.value = Object.fromEntries(
                RENDERED_WEATHER_CONTROLS.map(({ key }) => [key, stats.weather[key]]),
            );
            authoringColors.value = Object.fromEntries(
                AUTHORING_COLORS.map(({ key }) => [
                    key,
                    colorToHex(stats.mood[key]),
                ]),
            );
            if (autoMood.value && stats.moodId !== moodId.value)
                moodId.value = stats.moodId;
            if (stats.weatherId !== weatherId.value)
                weatherId.value = stats.weatherId;
        }, 300);

        window.addEventListener("keydown", onKeydown);
        window.addEventListener("resize", updateCaptureGeometry);
    } catch (error) {
        console.error(error);
        await showRendererError(error);
    }
});

onBeforeUnmount(() => {
    window.clearInterval(statsTimer);
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("resize", updateCaptureGeometry);
    if (captureUrl.value) URL.revokeObjectURL(captureUrl.value);
    renderer?.destroy();
    destroyFallback?.();
});
</script>

<template>
    <main class="stage" :aria-busy="state === 'loading'">
        <canvas ref="canvas" aria-label="Animated Journey shader"></canvas>

        <template v-if="state === 'ready'">
            <section
                class="hud"
                :class="{
                    'hud-hidden': !hudVisible,
                    'rail-can-reveal': railCanReveal,
                }"
                aria-label="Journey interface"
            >
                <nav
                    class="side-rail"
                    aria-label="Interface panels"
                    @pointerleave="railCanReveal = true"
                >
                    <div class="rail-telemetry" aria-label="Renderer telemetry">
                        <span
                            class="rail-metric motion-status"
                            :class="{ holding: !travelRunning }"
                        >
                            <i></i><em>{{ statusLabel }}</em>
                        </span>
                        <span class="rail-metric"
                            ><b>{{ fps || ">" }}</b
                            ><em>FPS</em></span
                        >
                        <span class="rail-metric rail-frame">
                            <b>{{ renderSize }}</b>
                            <em v-if="renderScale < 0.995"
                                >{{ Math.round(renderScale * 100) }}%</em
                            >
                            <em v-else>FRAME</em>
                        </span>
                    </div>
                    <button
                        type="button"
                        :aria-pressed="activePanel === 'journey'"
                        @click="togglePanel('journey')"
                    >
                        <b>01</b><span>Journey</span>
                    </button>
                    <button
                        type="button"
                        :aria-pressed="activePanel === 'scene'"
                        @click="togglePanel('scene')"
                    >
                        <b>02</b><span>Scene</span>
                    </button>
                    <button
                        type="button"
                        :aria-pressed="activePanel === 'render'"
                        @click="togglePanel('render')"
                    >
                        <b>03</b><span>Render</span>
                    </button>
                    <button
                        type="button"
                        :aria-pressed="activePanel === 'lab'"
                        @click="togglePanel('lab')"
                    >
                        <b>04</b><span>Lab</span>
                    </button>
                    <button
                        type="button"
                        :aria-pressed="activePanel === 'credits'"
                        @click="togglePanel('credits')"
                    >
                        <b>05</b><span>Credits</span>
                    </button>
                    <button
                        class="rail-hide"
                        type="button"
                        title="Hide interface (H)"
                        @click="hideHud"
                    >
                        <b>H</b><span>Hide</span>
                    </button>
                </nav>

                <Transition name="drawer" mode="out-in">
                    <aside
                        v-if="activePanel"
                        :key="activePanel"
                        class="side-drawer"
                        :class="{ 'scene-drawer': activePanel === 'scene' }"
                        :aria-label="`${activePanel} controls`"
                    >
                        <button
                            class="drawer-close"
                            type="button"
                            aria-label="Close panel"
                            @click="activePanel = null"
                        >
                            ×
                        </button>

                        <section
                            v-if="activePanel === 'journey'"
                            class="panel-content"
                        >
                            <div class="drawer-heading">
                                <span>01 / JOURNEY</span>
                                <time>{{ travelTime.toFixed(1) }}s</time>
                            </div>
                            <div
                                class="journey-status"
                                :class="{ holding: !travelRunning }"
                            >
                                <i></i>
                                <span>
                                    <small>TRAIN STATUS</small>
                                    <strong>{{ statusLabel }}</strong>
                                </span>
                            </div>
                            <button
                                class="transport-button"
                                type="button"
                                @click="toggleTravel"
                            >
                                <span
                                    class="transport-icon"
                                    :class="{ stopped: !travelRunning }"
                                ></span>
                                <span>
                                    <small>{{
                                        travelRunning
                                            ? "TRAIN LIVE"
                                            : "TRAIN HOLD"
                                    }}</small>
                                    <strong>{{ travelLabel }}</strong>
                                </span>
                            </button>
                            <label class="range-row">
                                <span
                                    >Travel speed
                                    <output
                                        >{{ travelSpeed.toFixed(2) }}×</output
                                    ></span
                                >
                                <input
                                    v-model.number="travelSpeed"
                                    type="range"
                                    min="0.1"
                                    max="2.5"
                                    step="0.05"
                                    :style="{
                                        '--range-progress': `${((travelSpeed - 0.1) / 2.4) * 100}%`,
                                    }"
                                />
                            </label>
                            <div class="button-row">
                                <button type="button" @click="resetJourney">
                                    RESET JOURNEY
                                </button>
                                <button
                                    ref="captureButton"
                                    type="button"
                                    :disabled="captureActive"
                                    @click="captureStill"
                                >
                                    {{ capturePhase === "capturing" ? "CAPTURING" : "CAPTURE PNG" }}
                                </button>
                            </div>
                        </section>

                        <section
                            v-else-if="activePanel === 'scene'"
                            class="panel-content"
                        >
                            <div class="drawer-heading">
                                <span>02 / SCENE ENGINE</span>
                                <button
                                    class="text-button"
                                    type="button"
                                    @click="nextMood"
                                >
                                    NEXT / M
                                </button>
                            </div>
                            <div class="select-row">
                                <span>Authored scene</span>
                                <div
                                    class="scene-select"
                                    @focusout="closeSceneMenu"
                                >
                                    <button
                                        class="scene-select-trigger"
                                        type="button"
                                        aria-haspopup="listbox"
                                        :aria-expanded="sceneMenuOpen"
                                        @click="
                                            weatherMenuOpen = false;
                                            sceneMenuOpen = !sceneMenuOpen;
                                        "
                                    >
                                        <span>{{ selectedMoodName }}</span
                                        ><i aria-hidden="true"></i>
                                    </button>
                                    <ul
                                        v-if="sceneMenuOpen"
                                        class="scene-options"
                                        role="listbox"
                                        aria-label="Authored scene"
                                        @wheel.stop
                                    >
                                        <li
                                            v-for="mood in MOODS"
                                            :key="mood.id"
                                        >
                                            <button
                                                type="button"
                                                role="option"
                                                :aria-selected="
                                                    mood.id === moodId
                                                "
                                                @click="selectScene(mood.id)"
                                            >
                                                {{ mood.name }}
                                            </button>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            <div class="select-row">
                                <span>Physical weather</span>
                                <div
                                    class="scene-select"
                                    @focusout="closeWeatherMenu"
                                >
                                    <button
                                        class="scene-select-trigger"
                                        type="button"
                                        aria-haspopup="listbox"
                                        :aria-expanded="weatherMenuOpen"
                                        @click="
                                            sceneMenuOpen = false;
                                            weatherMenuOpen = !weatherMenuOpen;
                                        "
                                    >
                                        <span>{{ selectedWeatherName }}</span
                                        ><i aria-hidden="true"></i>
                                    </button>
                                    <ul
                                        v-if="weatherMenuOpen"
                                        class="scene-options"
                                        role="listbox"
                                        aria-label="Physical weather"
                                        @wheel.stop
                                    >
                                        <li
                                            v-for="weather in WEATHER_PRESETS"
                                            :key="weather.id"
                                        >
                                            <button
                                                type="button"
                                                role="option"
                                                :aria-selected="weather.id === weatherId"
                                                @click="selectWeather(weather.id)"
                                            >
                                                {{ weather.name }}
                                            </button>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                            <label class="switch-label">
                                <input v-model="autoMood" type="checkbox" />
                                <span class="switch"></span>
                                <span>AUTHORED JOURNEY</span>
                            </label>
                            <div v-if="autoMood" class="cue-readout">
                                <span><small>ACTIVE CUE</small><strong>{{ cueId.replaceAll("-", " ") }}</strong></span>
                                <i><b :style="{ transform: `scaleX(${cueProgress})` }"></b></i>
                            </div>
                            <label class="range-row">
                                <span
                                    >Scene intensity
                                    <output
                                        >{{
                                            Math.round(moodIntensity * 100)
                                        }}%</output
                                    ></span
                                >
                                <input
                                    v-model.number="moodIntensity"
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    :style="{
                                        '--range-progress': `${moodIntensity * 100}%`,
                                    }"
                                />
                            </label>
                        </section>

                        <section
                            v-else-if="activePanel === 'render'"
                            class="panel-content"
                        >
                            <div class="drawer-heading">
                                <span>03 / RENDER</span>
                                <span class="exact-badge"
                                    >SHADER BASE AT 0%</span
                                >
                            </div>
                            <div class="render-readout">
                                <span
                                    ><small>BACKEND</small
                                    ><strong>WEBGPU</strong></span
                                >
                                <span
                                    ><small>FRAME</small
                                    ><strong>{{ fps || ">" }} FPS</strong></span
                                >
                                <span
                                    ><small>INTERNAL</small
                                    ><strong>{{ renderSize }}</strong></span
                                >
                            </div>
                            <label class="switch-label preview-switch">
                                <input
                                    type="checkbox"
                                    :checked="fallbackPreview"
                                    @change="setFallbackPreview($event.target.checked)"
                                />
                                <span class="switch"></span>
                                <span>PLATFORM NOTICE PREVIEW</span>
                            </label>
                            <label class="range-row">
                                <span
                                    >Temporal feedback
                                    <output>{{
                                        feedbackAmount.toFixed(2)
                                    }}</output></span
                                >
                                <input
                                    v-model.number="feedbackAmount"
                                    type="range"
                                    min="0"
                                    max="0.65"
                                    step="0.01"
                                    :style="{
                                        '--range-progress': `${(feedbackAmount / 0.65) * 100}%`,
                                    }"
                                />
                            </label>
                            <label class="range-row">
                                <span
                                    >Vignette
                                    <output
                                        >{{
                                            Math.round(vignetteStrength * 100)
                                        }}%</output
                                    ></span
                                >
                                <input
                                    v-model.number="vignetteStrength"
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.01"
                                    :style="{
                                        '--range-progress': `${vignetteStrength * 100}%`,
                                    }"
                                />
                            </label>
                            <p class="hint">
                                <kbd>SPACE</kbd> train · <kbd>M</kbd> scene ·
                                <kbd>H</kbd> UI · <kbd>R</kbd> reset
                            </p>
                        </section>

                        <section
                            v-else-if="activePanel === 'lab'"
                            class="panel-content lab-content"
                        >
                            <div class="drawer-heading">
                                <span>04 / ENGINE LAB</span>
                                <span :class="{ frozen: weatherFrozen }">
                                    {{ weatherFrozen ? "WX FROZEN" : `WX ${weatherTime.toFixed(1)}` }}
                                </span>
                            </div>
                            <div class="lab-tabs" role="tablist" aria-label="Engine lab">
                                <button
                                    type="button"
                                    role="tab"
                                    :aria-selected="labMode === 'scene'"
                                    @click="labMode = 'scene'"
                                >
                                    SCENE
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    :aria-selected="labMode === 'weather'"
                                    @click="labMode = 'weather'"
                                >
                                    WEATHER
                                </button>
                            </div>

                            <template v-if="labMode === 'scene'">
                                <div class="lab-section-heading">
                                    <span>SCENE</span>
                                    <small>PALETTE · SUBJECT · GRADE</small>
                                </div>
                                <label
                                    v-for="control in MOOD_ONLY_CONTROLS"
                                    :key="control.key"
                                    class="range-row compact-row"
                                >
                                    <span>{{ control.label }}
                                        <output>{{ authoringValues[control.key]?.toFixed(2) ?? "-" }}</output>
                                    </span>
                                    <input
                                        v-model.number="authoringValues[control.key]"
                                        type="range"
                                        :min="control.min"
                                        :max="control.max"
                                        :step="control.step"
                                        :style="{
                                            '--range-progress': `${((authoringValues[control.key] - control.min) / (control.max - control.min)) * 100}%`,
                                        }"
                                        @input="overrideMood(control.key, authoringValues[control.key])"
                                    />
                                </label>
                                <div class="color-grid" aria-label="Authored scene colors">
                                    <label
                                        v-for="color in AUTHORING_COLORS"
                                        :key="color.key"
                                        class="color-row"
                                    >
                                        <span>{{ color.label }}</span>
                                        <input
                                            v-model="authoringColors[color.key]"
                                            type="color"
                                            @input="overrideMoodColor(color.key, authoringColors[color.key])"
                                        />
                                    </label>
                                </div>
                            </template>

                            <template v-else>
                                <div class="weather-diagnostics">
                                    <span><small>STATE</small><strong>{{ selectedWeatherName }}</strong></span>
                                    <span><small>SURFACE</small><strong>{{ Math.round(surfaceWetness * 100) }}% WET</strong></span>
                                    <span><small>PERFORMANCE</small><strong>{{ weatherQuality }}</strong></span>
                                </div>

                                <div class="lab-section-heading">
                                    <span>WEATHER SOURCE</span>
                                    <small>{{ weatherFrontEnabled ? "FRONT" : "MANUAL" }}</small>
                                </div>
                                <div class="select-row">
                                    <span>Physical preset</span>
                                    <div class="scene-select" @focusout="closeWeatherMenu">
                                        <button
                                            class="scene-select-trigger"
                                            type="button"
                                            aria-haspopup="listbox"
                                            :aria-expanded="weatherMenuOpen"
                                            @click="
                                                weatherFrontMenuOpen = false;
                                                weatherMenuOpen = !weatherMenuOpen;
                                            "
                                        >
                                            <span>{{ selectedWeatherName }}</span><i aria-hidden="true"></i>
                                        </button>
                                        <ul
                                            v-if="weatherMenuOpen"
                                            class="scene-options"
                                            role="listbox"
                                            aria-label="Physical weather preset"
                                            @wheel.stop
                                        >
                                            <li v-for="weather in WEATHER_PRESETS" :key="weather.id">
                                                <button
                                                    type="button"
                                                    role="option"
                                                    :aria-selected="weather.id === weatherId"
                                                    @click="selectWeather(weather.id)"
                                                >{{ weather.name }}</button>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                                <div class="select-row">
                                    <span>Weather front</span>
                                    <div class="scene-select" @focusout="closeWeatherFrontMenu">
                                        <button
                                            class="scene-select-trigger"
                                            type="button"
                                            aria-haspopup="listbox"
                                            :aria-expanded="weatherFrontMenuOpen"
                                            @click="
                                                weatherMenuOpen = false;
                                                weatherFrontMenuOpen = !weatherFrontMenuOpen;
                                            "
                                        >
                                            <span>{{ selectedWeatherFrontName }}</span><i aria-hidden="true"></i>
                                        </button>
                                        <ul
                                            v-if="weatherFrontMenuOpen"
                                            class="scene-options"
                                            role="listbox"
                                            aria-label="Weather front"
                                            @wheel.stop
                                        >
                                            <li v-for="front in WEATHER_FRONTS" :key="front.id">
                                                <button
                                                    type="button"
                                                    role="option"
                                                    :aria-selected="front.id === weatherFrontId"
                                                    @click="selectWeatherFront(front.id)"
                                                >{{ front.name }}</button>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                                <label class="switch-label">
                                    <input v-model="weatherFrontEnabled" type="checkbox" />
                                    <span class="switch"></span>
                                    <span>RUN WEATHER FRONT</span>
                                </label>
                                <label class="switch-label freeze-switch">
                                    <input v-model="weatherFrozen" type="checkbox" />
                                    <span class="switch"></span>
                                    <span>FREEZE PHYSICAL WEATHER</span>
                                </label>
                                <div v-if="weatherFrontEnabled" class="cue-readout weather-front-readout">
                                    <span><small>FRONT STAGE</small><strong>{{ weatherFrontStage.replaceAll("-", " ") }}</strong></span>
                                    <i><b :style="{ transform: `scaleX(${weatherFrontProgress})` }"></b></i>
                                    <button class="text-button" type="button" @click="nextWeatherFrontStage">
                                        ADVANCE STAGE
                                    </button>
                                </div>

                                <div class="lab-section-heading">
                                    <span>WEATHER PERFORMANCE</span>
                                    <small>RESOLUTION · RAIN FIELDS</small>
                                </div>
                                <div class="quality-options">
                                    <button
                                        v-for="mode in WEATHER_QUALITY_MODES"
                                        :key="mode.id"
                                        type="button"
                                        :aria-pressed="weatherQuality === mode.id"
                                        @click="weatherQuality = mode.id"
                                    >{{ mode.name }}</button>
                                </div>

                                <template v-for="group in WEATHER_CONTROL_GROUPS" :key="group.id">
                                    <div class="lab-section-heading weather-group-heading">
                                        <span>{{ group.name }}</span>
                                        <small>{{ group.controls.length }} CHANNELS</small>
                                    </div>
                                    <label
                                        v-for="control in group.controls"
                                        :key="control.key"
                                        class="range-row compact-row"
                                    >
                                        <span>{{ control.label }}
                                            <output>{{ weatherValues[control.key]?.toFixed(2) ?? "-" }}</output>
                                        </span>
                                        <input
                                            v-model.number="weatherValues[control.key]"
                                            type="range"
                                            :min="control.min"
                                            :max="control.max"
                                            :step="control.step"
                                            :style="{
                                                '--range-progress': `${((weatherValues[control.key] - control.min) / (control.max - control.min)) * 100}%`,
                                            }"
                                            @input="overrideWeather(control.key, weatherValues[control.key])"
                                        />
                                    </label>
                                </template>
                            </template>

                            <div class="button-row sticky-actions">
                                <button
                                    v-if="labMode === 'weather'"
                                    type="button"
                                    @click="resetToAuthoredWeather"
                                >
                                    CLEAR OVERRIDES
                                </button>
                                <button v-else type="button" @click="clearMoodOverrides">
                                    CLEAR OVERRIDES
                                </button>
                                <button type="button" @click="copyMoodState">
                                    {{ copyStatus }}
                                </button>
                            </div>
                        </section>

                        <section v-else class="panel-content credits-content">
                            <div class="drawer-heading">
                                <span>05 / CREDITS</span>
                                <span>JOURNEY</span>
                            </div>
                            <div class="credit-title">
                                <small>CREATED &amp; DIRECTED BY</small>
                                <strong>UJJWAL VIVEK</strong>
                            </div>
                            <dl class="credit-list">
                                <div>
                                    <dt>World &amp; experience</dt>
                                    <dd>Ujjwal Vivek</dd>
                                </div>
                                <div>
                                    <dt>Rendering system</dt>
                                    <dd>Vue · WebGPU · WGSL</dd>
                                </div>
                                <div>
                                    <dt>Shader reference</dt>
                                    <dd>Ndc3zl</dd>
                                </div>
                            </dl>
                            <p class="credit-note">
                                A moving rail-world built around weather,
                                ambience, music and the passage of time.
                            </p>
                        </section>
                    </aside>
                </Transition>
            </section>
        </template>

        <section
            v-if="captureUrl"
            class="capture-review"
            :class="{
                'is-review': capturePhase === 'review' || capturePhase === 'handoff',
                'is-gpu-closing': capturePhase === 'gpu-closing',
            }"
            role="dialog"
            aria-modal="true"
            aria-label="Journey photograph"
        >
            <figure class="capture-print" :style="captureStyle">
                <div class="capture-image">
                    <img :src="captureUrl" alt="Captured Journey scene" />
                </div>
                <figcaption>
                    <span class="capture-mark" aria-hidden="true">
                        JOURNEY // STILL
                    </span>
                    <div class="capture-actions">
                        <button
                            ref="captureDownloadButton"
                            type="button"
                            @click="downloadCapture"
                        >
                            DOWNLOAD
                        </button>
                        <button type="button" @click="continueJourney">
                            CONTINUE JOURNEY
                        </button>
                    </div>
                </figcaption>
            </figure>
        </section>

        <div
            v-if="state === 'error' || fallbackPreview"
            class="fallback"
            :role="state === 'error' ? 'alert' : 'dialog'"
        >
            <canvas ref="fallbackCanvas" class="fallback-art" aria-hidden="true"></canvas>
            <div class="fallback-card">
                <span class="eyebrow">JOURNEY // PLATFORM NOTICE</span>
                <strong>WEBGPU REQUIRED</strong>
                <p class="fallback-intro">The journey is a WebGPU and WGSL workpiece. This browser could not open its renderer.</p>
                <p class="fallback-diagnostic" v-if="state === 'error'">{{ message }}</p>
                <p class="fallback-diagnostic" v-else>Previewing the non-WebGPU platform notice.</p>
            </div>
        </div>
    </main>
</template>
