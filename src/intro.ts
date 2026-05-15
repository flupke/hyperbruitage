import { AudioFX } from "./audio";
import { createBox, createPlane, createPyramid, createSphere } from "./geometry";
import {
    add,
    clamp01,
    fromTRS,
    lerp,
    lerpVec3,
    lookAt,
    perspective,
    scale,
    smoothstep,
    type Vec3,
} from "./math";
import { Renderer, type Mesh } from "./renderer";

interface HudElements {
    helmet: HTMLElement;
    radioMessage: HTMLElement;
    phase: HTMLElement;
    velocity: HTMLElement;
    altitude: HTMLElement;
    signal: HTMLElement;
    mission: HTMLElement;
}

interface CameraState {
    position: Vec3;
    target: Vec3;
    fov: number;
    fog: Vec3;
    clear: Vec3;
}

const INTRO_DURATION = 31.5;
const ORBIT_END = 10.7;
const SPACE_END = 11.05;
const ENTRY_END = 17.6;
const SURFACE_START = 18.35;
const EARTH_CENTER: Vec3 = [0, -0.55, -16.5];
const EARTH_SUN_DIRECTION: Vec3 = [0.54, 0.36, 0.76];

const messages = [
    { at: 1.1, text: "Hyperbruitage, ici le canal Terre. Repondez." },
    { at: 5.2, text: "Alerte generale: des forces extra-terrestres ont perce l'orbite." },
    { at: 10.0, text: "Ils ont envahi la Terre. Priorite absolue: atterrissage immediat." },
    { at: 15.4, text: "Tu es notre dernier vecteur arme. Sauve l'humanite." },
    { at: 21.2, text: "Retropropulseurs en surcharge. Impact controle dans cinq secondes." },
    { at: 27.0, text: "Sol verrouille. Ouvre la rampe. Combat imminent." },
];

export class IntroSequence {
    private readonly box: Mesh;
    private readonly earth: Mesh;
    private readonly plane: Mesh;
    private readonly pyramid: Mesh;
    private readonly sphere: Mesh;
    private readonly stars;
    private startedAt = 0;
    private lastMessageIndex = -1;
    private landingPlayed = false;

    constructor(
        private readonly renderer: Renderer,
        private readonly hud: HudElements,
        private readonly audio: AudioFX,
    ) {
        this.box = renderer.createMesh(createBox());
        this.earth = renderer.createMesh(createSphere(64, 32));
        this.plane = renderer.createMesh(createPlane());
        this.pyramid = renderer.createMesh(createPyramid());
        this.sphere = renderer.createMesh(createSphere(18, 9));
        this.stars = renderer.createStarField();
    }

    start(now: number): void {
        this.startedAt = now;
        this.lastMessageIndex = -1;
        this.landingPlayed = false;
        this.hud.helmet.classList.add("active");
    }

    render(now: number): void {
        const time = (now - this.startedAt) / 1000;
        const normalized = clamp01(time / INTRO_DURATION);
        const stress = smoothstep(9, 25, time);
        const alarm = time > 19 && time < 27.2;
        this.audio.update(time, stress, alarm);

        const camera = this.cameraAt(time);
        this.renderer.resize();
        this.renderer.beginFrame(camera.clear);
        const projection = perspective(camera.fov, this.renderer.aspect, 0.08, 260);
        const view = lookAt(camera.position, camera.target, [0, 1, 0]);
        this.renderer.setCamera(projection, view, camera.position, camera.fog, [
            -EARTH_SUN_DIRECTION[0],
            -EARTH_SUN_DIRECTION[1],
            -EARTH_SUN_DIRECTION[2],
        ]);

        this.drawScene(time, normalized);
        this.updateHud(time, normalized, alarm);
    }

    isComplete(now: number): boolean {
        return (now - this.startedAt) / 1000 >= INTRO_DURATION;
    }

    private cameraAt(time: number): CameraState {
        const spacePosition: Vec3 = [0, 0.25, 4.6];
        const spaceTarget: Vec3 = [0, 0.03, -8.5];
        const entryPosition: Vec3 = [0, 1.25, 7.2];
        const entryTarget: Vec3 = [0, -1.6, -42];
        const descentPosition: Vec3 = [0, 7.6, 13.2];
        const descentTarget: Vec3 = [0, -0.45, -27];
        const landingPosition: Vec3 = [0, 1.85, 6.4];
        const landingTarget: Vec3 = [0, 1.24, -11.5];
        const aftershock = time > 25.8 ? Math.exp(-(time - 25.8) * 1.8) : 0;
        const entryTurbulence =
            smoothstep(ORBIT_END, 12.3, time) * (1 - smoothstep(ENTRY_END, 20.2, time));
        const descentTurbulence = smoothstep(12.5, 23.5, time) * (1 - smoothstep(27, 31, time));
        const turbulence = Math.max(entryTurbulence * 3.2, descentTurbulence);
        const shake: Vec3 = [
            Math.sin(time * 31.1) * 0.028 * turbulence + Math.sin(time * 45) * 0.05 * aftershock,
            Math.sin(time * 27.7) * 0.022 * turbulence + Math.cos(time * 39) * 0.035 * aftershock,
            Math.sin(time * 18.4) * 0.036 * turbulence,
        ];

        if (time < ORBIT_END) {
            return {
                position: add(spacePosition, shake),
                target: add(spaceTarget, scale(shake, 0.22)),
                fov: lerp(0.82, 0.92, smoothstep(6, ORBIT_END, time)),
                fog: [0.03, 0.035, 0.055],
                clear: [0.006, 0.008, 0.018],
            };
        }

        if (time < ENTRY_END) {
            const t = smoothstep(ORBIT_END, ENTRY_END, time);
            const ignition = smoothstep(ORBIT_END, 12.2, time);
            return {
                position: add(lerpVec3(spacePosition, entryPosition, ignition), shake),
                target: add(lerpVec3(spaceTarget, entryTarget, ignition), scale(shake, 0.16)),
                fov: lerp(0.94, 1.42, t),
                fog: lerpVec3([0.05, 0.035, 0.05], [0.43, 0.16, 0.065], t),
                clear: lerpVec3([0.01, 0.01, 0.022], [0.21, 0.065, 0.035], t),
            };
        }

        if (time < 24.5) {
            const t = smoothstep(ENTRY_END, 24.5, time);
            return {
                position: add(lerpVec3(descentPosition, landingPosition, t), shake),
                target: add(lerpVec3(descentTarget, landingTarget, t), scale(shake, 0.18)),
                fov: lerp(1.3, 1.08, smoothstep(ENTRY_END, 23, time)),
                fog: lerpVec3([0.34, 0.15, 0.08], [0.08, 0.07, 0.055], t),
                clear: lerpVec3([0.17, 0.08, 0.055], [0.05, 0.045, 0.05], t),
            };
        }

        return {
            position: add(landingPosition, shake),
            target: landingTarget,
            fov: lerp(1.12, 0.98, smoothstep(27, 31, time)),
            fog: [0.07, 0.055, 0.05],
            clear: [0.04, 0.035, 0.04],
        };
    }

    private drawScene(time: number, normalized: number): void {
        if (time < SURFACE_START) {
            this.renderer.drawStars(this.stars, time);
        }
        if (time < SPACE_END) {
            this.drawSpace(time);
        }
        if (time > SPACE_END && time < 24.8) {
            this.drawAtmosphere(time);
        }
        if (time > SURFACE_START) {
            this.drawSurface(time, normalized);
        }
    }

    private drawSpace(time: number): void {
        const earthPulse = 1 + Math.sin(time * 0.6) * 0.015;
        const earthModel = fromTRS(
            EARTH_CENTER,
            [0.08, time * 0.035 - 0.75, -0.08],
            [5.4 * earthPulse, 5.4 * earthPulse, 5.4 * earthPulse],
        );
        this.renderer.drawEarth(this.earth, earthModel, time, EARTH_SUN_DIRECTION, 0.3);
        this.renderer.drawMesh(
            this.sphere,
            fromTRS(EARTH_CENTER, [0.08, time * 0.035 - 0.75, -0.08], [5.86, 5.86, 5.86]),
            [0.2, 0.62, 1, 0.08],
            0.85,
            0.5,
        );
        this.drawSun();
        this.drawAlienFleet(time, -8, 0.9);
    }

    private drawSun(): void {
        this.renderer.drawMesh(
            this.sphere,
            fromTRS([5.7, 3.2, -8.1], [0, 0, 0], [1.15, 1.15, 1.15]),
            [1, 0.78, 0.32, 1],
            2.6,
            0.12,
        );
        this.renderer.drawMesh(
            this.sphere,
            fromTRS([5.7, 3.2, -8.1], [0, 0, 0], [2.35, 2.35, 2.35]),
            [1, 0.46, 0.14, 0.14],
            1.8,
            0.12,
        );
    }

    private drawAtmosphere(time: number): void {
        const entry = smoothstep(SPACE_END, 12.25, time) * (1 - smoothstep(ENTRY_END, 22.2, time));
        const cloud = smoothstep(ENTRY_END - 0.6, 20.5, time) * (1 - smoothstep(23.6, 25.2, time));
        this.drawReentryPlasma(time, entry);
        this.drawEntryCloudRush(time, cloud);
    }

    private drawEntryCloudRush(time: number, intensity: number): void {
        if (intensity <= 0.02) {
            return;
        }

        for (let i = 0; i < 9; i += 1) {
            const progress = (time * 0.72 + i * 0.19) % 1;
            const z = lerp(-34, 4.5, progress);
            const radius = lerp(4.2, 12.5, progress);
            const angle = i * 2.399;
            const x = Math.cos(angle) * radius;
            const y = 1.2 + Math.sin(angle) * radius * 0.32;
            const alpha =
                intensity * smoothstep(0.05, 0.3, progress) * (1 - smoothstep(0.78, 1, progress));
            this.renderer.drawMesh(
                this.sphere,
                fromTRS([x, y, z], [0, time * 0.12 + i, 0], [3.2, 0.42, 1.4]),
                [0.86, 0.62, 0.42, alpha * 0.16],
                0.9,
                0.8,
            );
        }
    }

    private drawReentryPlasma(time: number, intensity: number): void {
        if (intensity <= 0.02) {
            return;
        }

        for (let i = 0; i < 34; i += 1) {
            const progress = (time * (1.65 + (i % 5) * 0.08) + i * 0.137) % 1;
            const angle = i * 2.399 + Math.sin(time * 0.8 + i) * 0.05;
            const radius = lerp(0.6, 8.5, progress);
            const z = lerp(-38, 5.2, progress);
            const x = Math.cos(angle) * radius;
            const y = 1.05 + Math.sin(angle) * radius * 0.58;
            const streakLength = lerp(8.5, 1.2, progress);
            const streakWidth = lerp(0.04, 0.22, progress);
            const visible = smoothstep(0.04, 0.24, progress) * (1 - smoothstep(0.82, 1, progress));
            const heat = intensity * visible;
            this.renderer.drawMesh(
                this.box,
                fromTRS(
                    [x, y, z],
                    [0.04 * Math.sin(angle), 0, angle * 0.08],
                    [streakWidth, streakWidth, streakLength],
                ),
                [1, 0.22, 0.06, heat * 0.52],
                2.2,
                0.42,
            );
            if (i % 3 === 0) {
                this.renderer.drawMesh(
                    this.sphere,
                    fromTRS([x * 0.96, y * 0.96, z + 0.7], [0, time * 0.4, 0], [0.34, 0.18, 0.34]),
                    [1, 0.58, 0.14, heat * 0.38],
                    1.6,
                    0.42,
                );
            }
        }
    }

    private drawSurface(time: number, normalized: number): void {
        const openRamp = smoothstep(26.8, 30.5, time);
        this.renderer.drawMesh(
            this.plane,
            fromTRS([0, 0, -9], [0, 0, 0], [70, 1, 58]),
            [0.26, 0.24, 0.18, 1],
            0,
            0.95,
        );
        this.renderer.drawMesh(
            this.plane,
            fromTRS([0, 0.015, -9], [0, 0.38, 0], [16, 1, 64]),
            [0.18, 0.18, 0.16, 1],
            0.02,
            0.9,
        );

        for (let i = 0; i < 22; i += 1) {
            const side = i % 2 === 0 ? -1 : 1;
            const row = Math.floor(i / 2);
            const height = 1.4 + ((i * 19) % 7) * 0.55;
            const x = side * (4.3 + ((i * 11) % 5) * 1.35);
            const z = -5.5 - row * 3.2;
            this.renderer.drawMesh(
                this.box,
                fromTRS([x, height / 2, z], [0, 0.06 * i, 0], [1.25, height, 1.2]),
                [0.24, 0.23, 0.25, 1],
                0,
                0.85,
            );
            if (i % 3 === 0) {
                this.renderer.drawMesh(
                    this.box,
                    fromTRS(
                        [x + side * 0.04, height + 0.08, z],
                        [0, 0.06 * i, 0],
                        [1.34, 0.16, 1.3],
                    ),
                    [1, 0.23, 0.13, 0.72],
                    1.4,
                    0.78,
                );
            }
        }

        for (let i = 0; i < 9; i += 1) {
            const x = -10 + i * 2.55;
            const z = -17 - (i % 3) * 4.6;
            const bob = Math.sin(time * 3 + i) * 0.18;
            this.renderer.drawMesh(
                this.pyramid,
                fromTRS([x, 2.2 + bob, z], [Math.PI, time * 0.2 + i, 0.06], [1.0, 0.72, 1.85]),
                [0.05, 0.08, 0.1, 1],
                0.05,
                0.55,
            );
            this.renderer.drawMesh(
                this.box,
                fromTRS([x, 1.58 + bob, z], [0, time * 0.2 + i, 0], [1.3, 0.08, 2.5]),
                [1, 0.08, 0.18, 0.82],
                1.5,
                0.55,
            );
        }

        this.drawLandedShip(openRamp);

        const muzzleReady = smoothstep(28.6, 31.5, time);
        this.renderer.drawMesh(
            this.box,
            fromTRS(
                [1.18, 0.65 - muzzleReady * 0.28, 1.95],
                [-0.2, -0.08, 0.02],
                [0.54, 0.34, 1.7],
            ),
            [0.12, 0.13, 0.14, 1],
            0.1,
            0.2,
        );
        this.renderer.drawMesh(
            this.box,
            fromTRS(
                [1.18, 0.77 - muzzleReady * 0.28, 0.94],
                [-0.2, -0.08, 0.02],
                [0.28, 0.24, 0.64],
            ),
            [0.9, 0.1, 0.16, 1],
            1.2,
            0.2,
        );

        if (normalized > 0.8 && !this.landingPlayed) {
            this.landingPlayed = true;
            this.audio.landingThump();
        }
    }

    private drawLandedShip(openRamp: number): void {
        this.renderer.drawMesh(
            this.box,
            fromTRS([0, 0.92, 3.28], [0.05, 0, 0], [3.8, 1.42, 4.85]),
            [0.095, 0.1, 0.115, 1],
            0.02,
            0.42,
        );
        this.renderer.drawMesh(
            this.box,
            fromTRS([0, 1.62, 2.7], [0.12, 0, 0], [2.25, 0.82, 2.25]),
            [0.16, 0.18, 0.19, 1],
            0.04,
            0.36,
        );
        this.renderer.drawMesh(
            this.box,
            fromTRS([0, 2.02, 3.52], [0.24, 0, 0], [1.22, 0.36, 1.15]),
            [0.09, 0.34, 0.42, 0.84],
            0.75,
            0.28,
        );
        this.renderer.drawMesh(
            this.pyramid,
            fromTRS([0, 1.04, 0.58], [-Math.PI / 2, 0, 0], [3.65, 1.1, 2.3]),
            [0.11, 0.115, 0.13, 1],
            0.02,
            0.42,
        );

        for (let side = -1; side <= 1; side += 2) {
            this.renderer.drawMesh(
                this.box,
                fromTRS(
                    [side * 2.25, 0.82, 2.4],
                    [0.08, side * 0.13, side * 0.1],
                    [0.42, 1.1, 4.2],
                ),
                [0.075, 0.08, 0.095, 1],
                0.04,
                0.38,
            );
            this.renderer.drawMesh(
                this.pyramid,
                fromTRS(
                    [side * 2.92, 0.7, 1.35],
                    [0.05, side * 0.34, side * 0.32],
                    [1.45, 0.34, 2.45],
                ),
                [0.09, 0.095, 0.11, 1],
                0.02,
                0.42,
            );
            this.renderer.drawMesh(
                this.box,
                fromTRS([side * 1.78, 0.72, 4.85], [0, 0, 0], [0.72, 0.62, 1.15]),
                [0.06, 0.065, 0.08, 1],
                0.02,
                0.3,
            );
            this.renderer.drawMesh(
                this.box,
                fromTRS([side * 1.78, 0.72, 5.4], [0, 0, 0], [0.48, 0.42, 0.12]),
                [0.3, 0.82, 1, 0.7],
                1.6,
                0.24,
            );
            this.renderer.drawMesh(
                this.box,
                fromTRS([side * 1.85, 0.18, 1.35], [0.2, 0, side * 0.22], [0.18, 0.78, 0.18]),
                [0.06, 0.06, 0.07, 1],
                0,
                0.38,
            );
            this.renderer.drawMesh(
                this.box,
                fromTRS([side * 1.98, 0.05, 0.98], [0, 0, 0], [0.9, 0.12, 0.48]),
                [0.045, 0.045, 0.052, 1],
                0,
                0.38,
            );
        }

        const rampY = lerp(0.78, 0.08, openRamp);
        const rampRot = lerp(0, -0.9, openRamp);
        this.renderer.drawMesh(
            this.box,
            fromTRS([0, rampY, 0.75], [rampRot, 0, 0], [3.2, 0.12, 3.9]),
            [0.1, 0.105, 0.115, 1],
            0,
            0.45,
        );
        this.renderer.drawMesh(
            this.box,
            fromTRS([0, rampY + 0.08, 0.74], [rampRot, 0, 0], [2.78, 0.035, 3.48]),
            [0.34, 0.82, 1, 0.22],
            1.25,
            0.4,
        );
    }

    private drawAlienFleet(time: number, zOffset: number, scaleFactor: number): void {
        for (let i = 0; i < 8; i += 1) {
            const angle = i * 0.78 + time * 0.12;
            const radius = 4.4 + (i % 3) * 1.2;
            const x = Math.cos(angle) * radius;
            const y = -0.2 + Math.sin(i * 1.7) * 1.3;
            const z = zOffset - 4.5 + Math.sin(angle) * 2.4;
            this.renderer.drawMesh(
                this.pyramid,
                fromTRS(
                    [x, y, z],
                    [0.15, -angle, 0.18],
                    [0.6 * scaleFactor, 0.38 * scaleFactor, 1.35 * scaleFactor],
                ),
                [0.08, 0.1, 0.12, 1],
                0.08,
                0.5,
            );
            this.renderer.drawMesh(
                this.box,
                fromTRS(
                    [x, y - 0.08, z + 0.12],
                    [0.15, -angle, 0.18],
                    [0.9 * scaleFactor, 0.07 * scaleFactor, 1.55 * scaleFactor],
                ),
                [1, 0.05, 0.15, 0.9],
                1.7,
                0.4,
            );
        }
    }

    private updateHud(time: number, normalized: number, alarm: boolean): void {
        this.hud.helmet.classList.toggle("alarm", alarm);
        let activeMessageIndex = 0;
        for (let index = 0; index < messages.length; index += 1) {
            if (time >= messages[index].at) {
                activeMessageIndex = index;
            }
        }
        if (activeMessageIndex !== this.lastMessageIndex) {
            this.lastMessageIndex = activeMessageIndex;
            this.audio.transmissionTick();
        }

        const message = messages[activeMessageIndex];
        const age = Math.max(0, time - message.at);
        const visibleChars = Math.min(message.text.length, Math.floor(age * 23));
        this.hud.radioMessage.textContent = message.text.slice(0, visibleChars);

        if (time < ORBIT_END) {
            this.hud.phase.textContent = "ROUTE ORBITALE";
            this.hud.mission.textContent = "Recevoir transmission";
        } else if (time < ENTRY_END) {
            this.hud.phase.textContent = "RENTREE ATMOSPHERIQUE";
            this.hud.mission.textContent = "Tenir le couloir de descente";
        } else if (time < 24.5) {
            this.hud.phase.textContent = "APPROCHE SOL";
            this.hud.mission.textContent = "Preparer l'atterrissage";
        } else if (time < 29) {
            this.hud.phase.textContent = "CONTACT SOL";
            this.hud.mission.textContent = "Stabiliser la rampe";
        } else {
            this.hud.phase.textContent = "COMBAT IMMINENT";
            this.hud.mission.textContent = "Sauver l'humanite";
        }

        const velocity = lerp(7.8, 0.2, smoothstep(20.5, 28.8, time)) + Math.sin(time * 5) * 0.08;
        this.hud.velocity.textContent = `${velocity.toFixed(1)} KM/S`;

        const altitude = Math.max(0, Math.round(lerp(248, 0, smoothstep(12, 27.5, time))));
        this.hud.altitude.textContent = altitude > 0 ? `${altitude} KM` : "SOL";

        const signal = Math.max(
            42,
            Math.round(100 - smoothstep(9, 23, time) * 48 + Math.sin(time * 9) * 4),
        );
        this.hud.signal.textContent = `SIGNAL ${signal}%`;
    }
}
