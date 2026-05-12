import { createBox, createPlane, createPyramid, createSphere } from "./geometry.js";
import { add, clamp01, fromTRS, lerp, lerpVec3, lookAt, perspective, scale, smoothstep, type Vec3 } from "./math.js";
import { AudioFX } from "./audio.js";
import { Renderer, type Mesh } from "./renderer.js";

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
    this.plane = renderer.createMesh(createPlane());
    this.pyramid = renderer.createMesh(createPyramid());
    this.sphere = renderer.createMesh(createSphere(13, 7));
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
    this.renderer.setCamera(projection, view, camera.position, camera.fog, [-0.58, -0.38, -0.72]);

    this.drawScene(time, normalized);
    this.updateHud(time, normalized, alarm);
  }

  isComplete(now: number): boolean {
    return (now - this.startedAt) / 1000 >= INTRO_DURATION;
  }

  private cameraAt(time: number): CameraState {
    const spacePosition: Vec3 = [0, 0.25, 4.6];
    const spaceTarget: Vec3 = [0, 0.03, -8.5];
    const descentPosition: Vec3 = [0, 7.8, 11.5];
    const descentTarget: Vec3 = [0, 1.2, -8];
    const landingPosition: Vec3 = [0, 1.85, 6.4];
    const landingTarget: Vec3 = [0, 1.24, -11.5];
    const aftershock = time > 25.8 ? Math.exp(-(time - 25.8) * 1.8) : 0;
    const turbulence = smoothstep(12.5, 23.5, time) * (1 - smoothstep(27, 31, time));
    const shake: Vec3 = [
      Math.sin(time * 31.1) * 0.028 * turbulence + Math.sin(time * 45) * 0.05 * aftershock,
      Math.sin(time * 27.7) * 0.022 * turbulence + Math.cos(time * 39) * 0.035 * aftershock,
      Math.sin(time * 18.4) * 0.036 * turbulence,
    ];

    if (time < 12.5) {
      return {
        position: add(spacePosition, shake),
        target: add(spaceTarget, scale(shake, 0.22)),
        fov: lerp(0.82, 0.92, smoothstep(6, 12.5, time)),
        fog: [0.03, 0.035, 0.055],
        clear: [0.006, 0.008, 0.018],
      };
    }

    if (time < 24.5) {
      const t = smoothstep(12.5, 24.5, time);
      return {
        position: add(lerpVec3(descentPosition, landingPosition, t), shake),
        target: add(lerpVec3(descentTarget, landingTarget, t), scale(shake, 0.18)),
        fov: lerp(0.96, 1.18, smoothstep(16.5, 22.6, time)),
        fog: lerpVec3([0.28, 0.11, 0.08], [0.08, 0.07, 0.055], t),
        clear: lerpVec3([0.2, 0.08, 0.055], [0.05, 0.045, 0.05], t),
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
    this.renderer.drawStars(this.stars, time);
    if (time < 14.4) {
      this.drawSpace(time);
    }
    if (time > 8.5) {
      this.drawAtmosphere(time);
    }
    if (time > 12.4) {
      this.drawSurface(time, normalized);
    }
  }

  private drawSpace(time: number): void {
    const earthPulse = 1 + Math.sin(time * 0.6) * 0.015;
    this.renderer.drawMesh(this.sphere, fromTRS([0, -0.55, -16.5], [0.1, time * 0.05, 0], [5.4 * earthPulse, 5.4 * earthPulse, 5.4 * earthPulse]), [0.05, 0.34, 0.66, 1], 0.02, 0.35);
    this.renderer.drawMesh(this.sphere, fromTRS([-1.28, -0.05, -14.15], [0.3, 0, 0.2], [1.5, 0.22, 0.8]), [0.09, 0.55, 0.28, 1], 0, 0.55);
    this.renderer.drawMesh(this.sphere, fromTRS([1.08, -1.07, -14.08], [-0.2, 0.5, -0.2], [1.9, 0.24, 0.62]), [0.1, 0.48, 0.25, 1], 0, 0.55);
    this.renderer.drawMesh(this.sphere, fromTRS([0, -0.55, -16.5], [0, 0, 0], [5.76, 5.76, 5.76]), [0.25, 0.85, 1, 0.18], 0.55, 0.5);
    this.drawAlienFleet(time, -8, 0.9);
  }

  private drawAtmosphere(time: number): void {
    const fall = smoothstep(12.5, 24.5, time);
    const glow = 1 - smoothstep(22, 26, time);
    this.renderer.drawMesh(this.plane, fromTRS([0, -1.6, -13], [0, 0, 0], [44, 1, 44]), [0.67, 0.2, 0.07, 0.28 * glow], 1.1, 1.7);
    for (let i = 0; i < 11; i += 1) {
      const x = -15 + i * 3.2;
      const y = 2.6 + Math.sin(time * 3.2 + i) * 0.35;
      const z = -18 + ((i * 7) % 9);
      this.renderer.drawMesh(this.box, fromTRS([x, y - fall * 7.5, z], [0.8, 0.2, 0.75], [0.08, 0.08, 4.5]), [1, 0.36, 0.12, 0.56], 1.2, 0.6);
    }
  }

  private drawSurface(time: number, normalized: number): void {
    const openRamp = smoothstep(26.8, 30.5, time);
    this.renderer.drawMesh(this.plane, fromTRS([0, 0, -9], [0, 0, 0], [70, 1, 58]), [0.26, 0.24, 0.18, 1], 0, 0.95);
    this.renderer.drawMesh(this.plane, fromTRS([0, 0.015, -9], [0, 0.38, 0], [16, 1, 64]), [0.18, 0.18, 0.16, 1], 0.02, 0.9);

    for (let i = 0; i < 22; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const height = 1.4 + ((i * 19) % 7) * 0.55;
      const x = side * (4.3 + ((i * 11) % 5) * 1.35);
      const z = -5.5 - row * 3.2;
      this.renderer.drawMesh(this.box, fromTRS([x, height / 2, z], [0, 0.06 * i, 0], [1.25, height, 1.2]), [0.24, 0.23, 0.25, 1], 0, 0.85);
      if (i % 3 === 0) {
        this.renderer.drawMesh(this.box, fromTRS([x + side * 0.04, height + 0.08, z], [0, 0.06 * i, 0], [1.34, 0.16, 1.3]), [1, 0.23, 0.13, 0.72], 1.4, 0.78);
      }
    }

    for (let i = 0; i < 9; i += 1) {
      const x = -10 + i * 2.55;
      const z = -17 - (i % 3) * 4.6;
      const bob = Math.sin(time * 3 + i) * 0.18;
      this.renderer.drawMesh(this.pyramid, fromTRS([x, 2.2 + bob, z], [Math.PI, time * 0.2 + i, 0.06], [1.0, 0.72, 1.85]), [0.05, 0.08, 0.1, 1], 0.05, 0.55);
      this.renderer.drawMesh(this.box, fromTRS([x, 1.58 + bob, z], [0, time * 0.2 + i, 0], [1.3, 0.08, 2.5]), [1, 0.08, 0.18, 0.82], 1.5, 0.55);
    }

    const rampY = lerp(0.78, 0.08, openRamp);
    const rampRot = lerp(0, -0.9, openRamp);
    this.renderer.drawMesh(this.box, fromTRS([0, rampY, 0.75], [rampRot, 0, 0], [3.2, 0.12, 3.9]), [0.1, 0.105, 0.115, 1], 0, 0.45);

    const muzzleReady = smoothstep(28.6, 31.5, time);
    this.renderer.drawMesh(this.box, fromTRS([1.18, 0.65 - muzzleReady * 0.28, 1.95], [-0.2, -0.08, 0.02], [0.54, 0.34, 1.7]), [0.12, 0.13, 0.14, 1], 0.1, 0.2);
    this.renderer.drawMesh(this.box, fromTRS([1.18, 0.77 - muzzleReady * 0.28, 0.94], [-0.2, -0.08, 0.02], [0.28, 0.24, 0.64]), [0.9, 0.1, 0.16, 1], 1.2, 0.2);

    if (normalized > 0.8 && !this.landingPlayed) {
      this.landingPlayed = true;
      this.audio.landingThump();
    }
  }

  private drawAlienFleet(time: number, zOffset: number, scaleFactor: number): void {
    for (let i = 0; i < 8; i += 1) {
      const angle = i * 0.78 + time * 0.12;
      const radius = 4.4 + (i % 3) * 1.2;
      const x = Math.cos(angle) * radius;
      const y = -0.2 + Math.sin(i * 1.7) * 1.3;
      const z = zOffset - 4.5 + Math.sin(angle) * 2.4;
      this.renderer.drawMesh(this.pyramid, fromTRS([x, y, z], [0.15, -angle, 0.18], [0.6 * scaleFactor, 0.38 * scaleFactor, 1.35 * scaleFactor]), [0.08, 0.1, 0.12, 1], 0.08, 0.5);
      this.renderer.drawMesh(this.box, fromTRS([x, y - 0.08, z + 0.12], [0.15, -angle, 0.18], [0.9 * scaleFactor, 0.07 * scaleFactor, 1.55 * scaleFactor]), [1, 0.05, 0.15, 0.9], 1.7, 0.4);
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

    if (time < 12.5) {
      this.hud.phase.textContent = "ROUTE ORBITALE";
      this.hud.mission.textContent = "Recevoir transmission";
    } else if (time < 24.5) {
      this.hud.phase.textContent = "DESCENTE FORCEE";
      this.hud.mission.textContent = "Atterrir immediatement";
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

    const signal = Math.max(42, Math.round(100 - smoothstep(9, 23, time) * 48 + Math.sin(time * 9) * 4));
    this.hud.signal.textContent = `SIGNAL ${signal}%`;
  }
}
