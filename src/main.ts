import { AudioFX } from "./audio";
import { GameplayScene } from "./gameplay";
import { InputController } from "./input";
import { IntroSequence } from "./intro";
import { Renderer } from "./renderer";

const canvas = document.getElementById("game") as HTMLCanvasElement | null;
const boot = document.getElementById("boot-screen");
const startButton = document.getElementById("start-intro") as HTMLButtonElement | null;
const combatPrompt = document.getElementById("combat-prompt");
const combatButton = document.getElementById("enter-combat") as HTMLButtonElement | null;
const helmet = document.getElementById("helmet-ui");
const radioMessage = document.getElementById("radio-message");
const phase = document.getElementById("phase-label");
const velocity = document.getElementById("velocity-label");
const altitude = document.getElementById("altitude-label");
const signal = document.getElementById("signal-label");
const mission = document.getElementById("mission-text");
const minimap = document.getElementById("mini-map") as HTMLCanvasElement | null;

if (
    !canvas ||
    !boot ||
    !startButton ||
    !combatPrompt ||
    !combatButton ||
    !helmet ||
    !radioMessage ||
    !phase ||
    !velocity ||
    !altitude ||
    !signal ||
    !mission ||
    !minimap
) {
    throw new Error("Interface Hyperbruitage incomplete.");
}

const renderer = new Renderer(canvas);
const audio = new AudioFX();
const input = new InputController(canvas);
const hud = { helmet, radioMessage, phase, velocity, altitude, signal, mission, minimap };
const intro = new IntroSequence(renderer, hud, audio);
const gameplay = new GameplayScene(renderer, hud, input, audio);

type AppMode = "boot" | "intro" | "handoff" | "combat";
let mode: AppMode = "boot";

const completeIntro = (now: number) => {
    if (mode !== "intro") {
        return;
    }
    mode = "handoff";
    gameplay.start(now);
    combatPrompt.classList.add("active");
};

const frame = (now: number) => {
    if (mode === "intro") {
        intro.render(now);
        if (intro.isComplete(now)) {
            completeIntro(now);
        }
    } else if (mode === "handoff" || mode === "combat") {
        gameplay.render(now);
    }
    requestAnimationFrame(frame);
};

const start = () => {
    mode = "intro";
    audio.start();
    boot.classList.add("hidden");
    helmet.classList.remove("combat-ready");
    intro.start(performance.now());
};

const enterCombat = () => {
    mode = "combat";
    combatPrompt.classList.remove("active");
    helmet.classList.add("combat-ready");
    audio.start();
    gameplay.engage(performance.now());
    input.requestPointerLock();
};

startButton.addEventListener("click", start, { once: true });
combatButton.addEventListener("click", enterCombat);
window.addEventListener("keydown", (event) => {
    if (
        mode !== "intro" ||
        (event.code !== "Escape" && event.code !== "Enter" && event.code !== "NumpadEnter")
    ) {
        return;
    }
    event.preventDefault();
    completeIntro(performance.now());
});
window.addEventListener("resize", () => renderer.resize());
renderer.resize();
requestAnimationFrame(frame);
