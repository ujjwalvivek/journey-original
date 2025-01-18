<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { JourneyRenderer } from "./webgpu/renderer.js";
import { MOODS } from "./webgpu/moodEngine.js";

const canvas = ref(null);
const state = ref("loading");
const message = ref("Starting WebGPU…");
const hudVisible = ref(true);
const travelRunning = ref(true);
const travelSpeed = ref(1);
const moodId = ref("original");
const moodIntensity = ref(0);
const autoMood = ref(false);
const cycleSeconds = ref(14);
const feedbackAmount = ref(0.3);
const vignetteStrength = ref(1);
const fps = ref(0);
const renderSize = ref("-");
const sceneTime = ref(0);

let renderer = null;
let statsTimer = 0;

const travelLabel = computed(() =>
    travelRunning.value ? "STOP TRAIN" : "START TRAIN",
);
const statusLabel = computed(() =>
    travelRunning.value ? "IN MOTION" : "HOLDING",
);

function toggleTravel() {
    travelRunning.value = !travelRunning.value;
    renderer?.setTravelRunning(travelRunning.value);
}

function resetJourney() {
    renderer?.resetJourney();
}

function nextMood() {
    const next = renderer?.nextMood();
    if (next) moodId.value = next;
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

function onKeydown(event) {
    if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
    )
        return;
    if (event.code === "Space") {
        event.preventDefault();
        toggleTravel();
    } else if (event.key.toLowerCase() === "m") {
        nextMood();
    } else if (event.key.toLowerCase() === "h") {
        hudVisible.value = !hudVisible.value;
    } else if (event.key.toLowerCase() === "r") {
        resetJourney();
    }
}

watch(travelSpeed, (value) => renderer?.setTravelSpeed(value));
watch(moodId, (value) => renderer?.setMood(value));
watch(moodIntensity, (value) => renderer?.setMoodIntensity(value));
watch(autoMood, (value) => renderer?.setAutoMood(value));
watch(cycleSeconds, (value) => renderer?.setMoodCycleSeconds(value));
watch(feedbackAmount, (value) => renderer?.setFeedbackAmount(value));
watch(vignetteStrength, (value) => renderer?.setVignetteStrength(value));

onMounted(async () => {
    try {
        if (!navigator.gpu) {
            state.value = "error";
            message.value =
                "WebGPU is not available in this browser. Use a current Chrome or Edge build.";
            return;
        }

        renderer = new JourneyRenderer(canvas.value);
        await renderer.init();
        renderer.setTravelRunning(travelRunning.value);
        renderer.setTravelSpeed(travelSpeed.value);
        renderer.setMood(moodId.value);
        renderer.setMoodIntensity(moodIntensity.value);
        renderer.setAutoMood(autoMood.value);
        renderer.setMoodCycleSeconds(cycleSeconds.value);
        renderer.setFeedbackAmount(feedbackAmount.value);
        renderer.setVignetteStrength(vignetteStrength.value);
        renderer.startRenderer();
        state.value = "ready";

        statsTimer = window.setInterval(() => {
            const stats = renderer?.getStats();
            if (!stats) return;
            fps.value = stats.fps;
            renderSize.value = `${stats.width}×${stats.height}`;
            sceneTime.value = stats.sceneTime;
            travelRunning.value = stats.travelRunning;
            if (autoMood.value && stats.moodId !== moodId.value)
                moodId.value = stats.moodId;
        }, 300);

        window.addEventListener("keydown", onKeydown);
    } catch (error) {
        console.error(error);
        state.value = "error";
        message.value = error instanceof Error ? error.message : String(error);
    }
});

onBeforeUnmount(() => {
    window.clearInterval(statsTimer);
    window.removeEventListener("keydown", onKeydown);
    renderer?.destroy();
});
</script>

<template>
    <main class="stage">
        <canvas ref="canvas" aria-label="Animated Journey shader"></canvas>

        <template v-if="state === 'ready'">
            <button
                class="hud-toggle"
                type="button"
                :aria-label="hudVisible ? 'Hide HUD' : 'Show HUD'"
                :title="hudVisible ? 'Hide HUD (H)' : 'Show HUD (H)'"
                @click="hudVisible = !hudVisible"
            >
                {{ hudVisible ? "HUD−" : "HUD+" }}
            </button>

            <section
                v-show="hudVisible"
                class="hud"
                aria-label="Journey controls"
            >
                <header class="topbar">
                    <div class="identity">
                        <span class="eyebrow">JOURNEY // Ndc3zl</span>
                        <strong>RAIL WEATHER SYSTEM</strong>
                    </div>

                    <div class="telemetry" aria-label="Renderer telemetry">
                        <span><i></i> WEBGPU</span>
                        <span>{{ fps || ">" }} FPS</span>
                        <span>{{ renderSize }}</span>
                    </div>
                </header>

                <div class="crosshair" aria-hidden="true">
                    <span></span>
                    <b>{{ statusLabel }}</b>
                    <span></span>
                </div>

                <footer class="control-deck">
                    <section class="panel transport-panel">
                        <div class="panel-head">
                            <span>01 / TRANSPORT</span>
                            <time>{{ sceneTime.toFixed(1) }}s</time>
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
                                    travelRunning ? "TRAIN LIVE" : "TRAIN HOLD"
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

                    <section class="panel mood-panel">
                        <div class="panel-head">
                            <span>02 / MOOD ENGINE</span>
                            <button
                                class="text-button"
                                type="button"
                                @click="nextMood"
                            >
                                NEXT / M
                            </button>
                        </div>

                        <div class="mood-line">
                            <label>
                                <span>Palette</span>
                                <select v-model="moodId">
                                    <option
                                        v-for="mood in MOODS"
                                        :key="mood.id"
                                        :value="mood.id"
                                    >
                                        {{ mood.name }}
                                    </option>
                                </select>
                            </label>

                            <label class="switch-label">
                                <input v-model="autoMood" type="checkbox" />
                                <span class="switch"></span>
                                <span>AUTO CYCLE</span>
                            </label>
                        </div>

                        <label class="range-row">
                            <span
                                >Mood intensity
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
                            />
                        </label>

                        <label v-if="autoMood" class="range-row compact-row">
                            <span
                                >Cycle interval
                                <output>{{ cycleSeconds }}s</output></span
                            >
                            <input
                                v-model.number="cycleSeconds"
                                type="range"
                                min="5"
                                max="40"
                                step="1"
                            />
                        </label>
                    </section>

                    <section class="panel shader-panel">
                        <div class="panel-head">
                            <span>03 / SHADER</span>
                            <span class="exact-badge">ORIGINAL 0% MOOD</span>
                        </div>

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
                            />
                        </label>

                        <p class="hint">
                            <kbd>SPACE</kbd> train · <kbd>M</kbd> mood ·
                            <kbd>H</kbd> HUD · <kbd>R</kbd> reset
                        </p>
                    </section>
                </footer>
            </section>
        </template>

        <div v-if="state !== 'ready'" class="fallback" role="status">
            <div class="fallback-card">
                <span class="eyebrow">JOURNEY // WEBGPU</span>
                <strong>{{
                    state === "loading"
                        ? "INITIALIZING RENDERER"
                        : "RENDERER OFFLINE"
                }}</strong>
                <p>{{ message }}</p>
            </div>
        </div>
    </main>
</template>
