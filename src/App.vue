<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { JourneyRenderer } from "./webgpu/renderer.js";
import { mountCanvasFallback } from "./fallback/canvasFallback.js";
import {
    AUTHORING_COLORS,
    AUTHORING_CONTROLS,
    MOODS,
} from "./webgpu/moodEngine.js";

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
const moodIntensity = ref(1);
const autoMood = ref(false);
const feedbackAmount = ref(0.3);
const vignetteStrength = ref(1);
const fps = ref(0);
const renderSize = ref("-");
const renderScale = ref(1);
const travelTime = ref(0);
const windTime = ref(0);
const cueId = ref("departure");
const cueProgress = ref(0);
const authoringValues = ref({});
const authoringColors = ref({});
const copyStatus = ref("COPY STATE");

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
    hudVisible.value = true;
    activePanel.value = activePanel.value === panel ? null : panel;
}

function hideHud(event) {
    hudVisible.value = false;
    railCanReveal.value = !event;
    activePanel.value = null;
    sceneMenuOpen.value = false;
    event?.currentTarget?.blur();
}

function selectScene(id) {
    autoMood.value = false;
    moodId.value = id;
    sceneMenuOpen.value = false;
}

function closeSceneMenu(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        sceneMenuOpen.value = false;
    }
}

async function captureStill() {
    if (!renderer) return;
    try {
        const blob = await renderer.capturePng();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `journey-${Date.now()}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
        console.error(error);
    }
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

async function copyMoodState() {
    const mood = renderer?.getStats().mood;
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
            AUTHORING_CONTROLS.map(({ key }) => [
                key,
                Number(mood[key].toFixed(4)),
            ]),
        ),
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
        activePanel.value = null;
    }
}

watch(travelSpeed, (value) => renderer?.setTravelSpeed(value));
watch(moodId, (value) => {
    if (renderer?.getStats().moodId !== value) renderer?.setMood(value);
});
watch(moodIntensity, (value) => renderer?.setMoodIntensity(value));
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
            windTime.value = stats.windTime;
            cueId.value = stats.cueId;
            cueProgress.value = stats.cueProgress;
            travelRunning.value = stats.travelRunning;
            authoringValues.value = Object.fromEntries(
                AUTHORING_CONTROLS.map(({ key }) => [key, stats.mood[key]]),
            );
            authoringColors.value = Object.fromEntries(
                AUTHORING_COLORS.map(({ key }) => [
                    key,
                    colorToHex(stats.mood[key]),
                ]),
            );
            if (autoMood.value && stats.moodId !== moodId.value)
                moodId.value = stats.moodId;
        }, 300);

        window.addEventListener("keydown", onKeydown);
    } catch (error) {
        console.error(error);
        await showRendererError(error);
    }
});

onBeforeUnmount(() => {
    window.clearInterval(statsTimer);
    window.removeEventListener("keydown", onKeydown);
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
                                <button type="button" @click="captureStill">
                                    CAPTURE PNG
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
                                        @click="sceneMenuOpen = !sceneMenuOpen"
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
                                <span>04 / MOOD LAB</span>
                                <span>W {{ windTime.toFixed(1) }}</span>
                            </div>
                            <label
                                v-for="control in AUTHORING_CONTROLS"
                                :key="control.key"
                                class="range-row compact-row"
                            >
                                <span
                                    >{{ control.label }}
                                    <output>{{
                                        authoringValues[control.key]?.toFixed(
                                            2,
                                        ) ?? "-"
                                    }}</output></span
                                >
                                <input
                                    v-model.number="
                                        authoringValues[control.key]
                                    "
                                    type="range"
                                    :min="control.min"
                                    :max="control.max"
                                    :step="control.step"
                                    :style="{
                                        '--range-progress': `${((authoringValues[control.key] - control.min) / (control.max - control.min)) * 100}%`,
                                    }"
                                    @input="
                                        overrideMood(
                                            control.key,
                                            authoringValues[control.key],
                                        )
                                    "
                                />
                            </label>
                            <div
                                class="color-grid"
                                aria-label="Authored scene colors"
                            >
                                <label
                                    v-for="color in AUTHORING_COLORS"
                                    :key="color.key"
                                    class="color-row"
                                >
                                    <span>{{ color.label }}</span>
                                    <input
                                        v-model="authoringColors[color.key]"
                                        type="color"
                                        @input="
                                            overrideMoodColor(
                                                color.key,
                                                authoringColors[color.key],
                                            )
                                        "
                                    />
                                </label>
                            </div>
                            <div class="button-row sticky-actions">
                                <button
                                    type="button"
                                    @click="clearMoodOverrides"
                                >
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
