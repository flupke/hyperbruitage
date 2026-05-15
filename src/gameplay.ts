import { AudioFX } from "./audio";
import { createBox, createPlane, createPyramid, createSphere } from "./geometry";
import { InputController } from "./input";
import {
    add,
    clamp01,
    dot,
    fromTRS,
    length,
    lerp,
    lookAt,
    normalize,
    perspective,
    scale,
    sub,
    type Vec3,
} from "./math";
import { Renderer, type Mesh, type SpriteTexture } from "./renderer";

const CACA_PARTICLE_URL = new URL("./images/caca.png", import.meta.url).href;
const MARC_PROJECTILE_URL = new URL("./images/marc.png", import.meta.url).href;

interface HudElements {
    helmet: HTMLElement;
    radioMessage: HTMLElement;
    phase: HTMLElement;
    velocity: HTMLElement;
    altitude: HTMLElement;
    signal: HTMLElement;
    mission: HTMLElement;
}

interface Player {
    position: Vec3;
    yaw: number;
    pitch: number;
    health: number;
    ammo: number;
    kills: number;
}

interface Enemy {
    position: Vec3;
    health: number;
    radius: number;
    phase: number;
    cooldown: number;
    hitFlash: number;
}

interface Beam {
    from: Vec3;
    to: Vec3;
    age: number;
    ttl: number;
    width: number;
    color: [number, number, number, number];
    emissive: number;
}

interface Grenade {
    position: Vec3;
    previousPosition: Vec3;
    velocity: Vec3;
    age: number;
    ttl: number;
    spin: number;
}

interface Explosion {
    position: Vec3;
    age: number;
    ttl: number;
    size: number;
}

interface CacaParticle {
    position: Vec3;
    velocity: Vec3;
    age: number;
    ttl: number;
    size: number;
    rotation: number;
    spin: number;
}

const MAX_AMMO = 12;
const MAX_GRENADE_CHARGE = 1.45;
const MIN_GRENADE_SPEED = 10;
const MAX_GRENADE_SPEED = 29;
const GRENADE_GRAVITY = 12.8;
const GRENADE_RADIUS = 0.34;
const GRENADE_BLAST_RADIUS = 5.8;
const ARENA_X = 18;
const ARENA_Z_BACK = 5.5;
const ARENA_Z_FRONT = -43;

export class GameplayScene {
    private readonly box: Mesh;
    private readonly cacaTexture: SpriteTexture;
    private readonly projectileTexture: SpriteTexture;
    private readonly plane: Mesh;
    private readonly pyramid: Mesh;
    private readonly sphere: Mesh;
    private readonly enemies: Enemy[] = [];
    private readonly beams: Beam[] = [];
    private readonly grenades: Grenade[] = [];
    private readonly explosions: Explosion[] = [];
    private readonly cacaParticles: CacaParticle[] = [];
    private readonly player: Player = {
        position: [0, 1.62, 3.3],
        yaw: 0,
        pitch: -0.04,
        health: 100,
        ammo: MAX_AMMO,
        kills: 0,
    };
    private startedAt = 0;
    private lastFrame = 0;
    private shotCooldown = 0;
    private reloadTimer = 0;
    private damageFlash = 0;
    private wave = 1;
    private nextWaveTimer = 0;
    private active = false;
    private radioLine = "Rampe ouverte. Les envahisseurs convergent vers ta position.";

    constructor(
        private readonly renderer: Renderer,
        private readonly hud: HudElements,
        private readonly input: InputController,
        private readonly audio: AudioFX,
    ) {
        this.box = renderer.createMesh(createBox());
        this.cacaTexture = renderer.createTexture(CACA_PARTICLE_URL);
        this.projectileTexture = renderer.createTexture(MARC_PROJECTILE_URL);
        this.plane = renderer.createMesh(createPlane());
        this.pyramid = renderer.createMesh(createPyramid());
        this.sphere = renderer.createMesh(createSphere(12, 7));
    }

    start(now: number): void {
        this.startedAt = now;
        this.lastFrame = now;
        this.active = false;
        this.wave = 1;
        this.nextWaveTimer = 0;
        this.shotCooldown = 0;
        this.reloadTimer = 0;
        this.damageFlash = 0;
        this.player.position = [0, 1.62, 3.3];
        this.player.yaw = 0;
        this.player.pitch = -0.04;
        this.player.health = 100;
        this.player.ammo = MAX_AMMO;
        this.player.kills = 0;
        this.enemies.length = 0;
        this.beams.length = 0;
        this.grenades.length = 0;
        this.explosions.length = 0;
        this.cacaParticles.length = 0;
        this.spawnWave();
        this.hud.helmet.classList.add("active");
        this.hud.helmet.classList.remove("alarm");
        this.updateHud(0);
    }

    engage(now: number): void {
        this.active = true;
        this.lastFrame = now;
        this.input.clearTransient();
    }

    render(now: number): void {
        const time = (now - this.startedAt) / 1000;
        const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
        this.lastFrame = now;

        if (this.active) {
            this.update(dt, time);
        } else {
            this.input.clearTransient();
        }

        this.renderer.resize();
        const danger = this.damageFlash * 0.08;
        this.renderer.beginFrame([0.04 + danger, 0.034, 0.038]);

        const eye = this.eyePosition();
        const lookDirection = this.lookDirection();
        const target = add(eye, lookDirection);
        const projection = perspective(
            1.05 + Math.min(0.12, this.damageFlash * 0.04),
            this.renderer.aspect,
            0.06,
            190,
        );
        const view = lookAt(eye, target, [0, 1, 0]);
        this.renderer.setCamera(projection, view, eye, [0.075, 0.06, 0.052], [-0.52, -0.42, -0.68]);

        this.drawArena(time);
        this.drawEnemies(time);
        this.drawEffects(time);
        this.drawWeapon(time);
        this.updateHud(time);
    }

    private update(dt: number, time: number): void {
        const [lookX, lookY] = this.input.consumeLook();
        this.player.yaw += lookX * 0.0022;
        this.player.pitch = Math.max(-1.15, Math.min(0.95, this.player.pitch - lookY * 0.0018));

        const forward = this.flatForward();
        const right = this.right();
        const moveForward =
            Number(this.input.isDown("KeyW") || this.input.isDown("ArrowUp")) -
            Number(this.input.isDown("KeyS") || this.input.isDown("ArrowDown"));
        const moveRight =
            Number(this.input.isDown("KeyD") || this.input.isDown("ArrowRight")) -
            Number(this.input.isDown("KeyA") || this.input.isDown("ArrowLeft"));
        const movement = add(scale(forward, moveForward), scale(right, moveRight));
        const movementLength = length(movement);
        if (movementLength > 0.001) {
            const sprint = this.input.isDown("ShiftLeft") || this.input.isDown("ShiftRight");
            const speed = sprint ? 7.2 : 4.85;
            this.player.position = add(
                this.player.position,
                scale(movement, (speed * dt) / movementLength),
            );
            this.player.position[0] = Math.max(
                -ARENA_X,
                Math.min(ARENA_X, this.player.position[0]),
            );
            this.player.position[2] = Math.max(
                ARENA_Z_FRONT,
                Math.min(ARENA_Z_BACK, this.player.position[2]),
            );
        }

        this.shotCooldown = Math.max(0, this.shotCooldown - dt);
        this.reloadTimer = Math.max(0, this.reloadTimer - dt);
        if (this.reloadTimer === 0 && this.player.ammo === 0) {
            this.player.ammo = MAX_AMMO;
            this.radioLine = "Chargeur hyper-sonique pret.";
            this.audio.transmissionTick();
        }

        if (this.input.isDown("KeyR") && this.player.ammo < MAX_AMMO && this.reloadTimer === 0) {
            this.reloadTimer = 0.85;
            this.player.ammo = 0;
            this.radioLine = "Rearmement en cours.";
        }

        const releasedCharge = this.input.consumePrimaryRelease();
        if (releasedCharge !== null) {
            this.fireGrenade(releasedCharge);
        }

        this.updateEnemies(dt, time);
        this.updateGrenades(dt);
        this.updateEffects(dt);
        this.damageFlash = Math.max(0, this.damageFlash - dt * 2.6);

        const aliveEnemies = this.enemies.filter((enemy) => enemy.health > 0).length;
        if (aliveEnemies === 0) {
            this.nextWaveTimer -= dt;
            if (this.nextWaveTimer <= 0) {
                this.wave += 1;
                this.spawnWave();
                this.radioLine = `Nouvelle vague detectee: niveau ${this.wave}.`;
                this.audio.transmissionTick();
            }
        }
    }

    private fireGrenade(heldSeconds: number): void {
        if (this.shotCooldown > 0 || this.reloadTimer > 0) {
            return;
        }
        if (this.player.ammo <= 0) {
            this.reloadTimer = 0.9;
            this.radioLine = "Chargeur vide.";
            this.audio.transmissionTick();
            return;
        }

        this.player.ammo -= 1;
        this.shotCooldown = 0.42;
        this.audio.shoot();

        const charge = clamp01(heldSeconds / MAX_GRENADE_CHARGE);
        const direction = this.lookDirection();
        const muzzle = this.weaponMuzzle();
        const start = add(muzzle, scale(direction, 0.36));
        const speed = lerp(MIN_GRENADE_SPEED, MAX_GRENADE_SPEED, charge);
        this.grenades.push({
            position: start,
            previousPosition: start,
            velocity: scale(direction, speed),
            age: 0,
            ttl: 4.2,
            spin: Math.random() * Math.PI,
        });
    }

    private updateEnemies(dt: number, time: number): void {
        for (const enemy of this.enemies) {
            if (enemy.health <= 0) {
                continue;
            }

            enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
            const toPlayer = sub(this.player.position, enemy.position);
            const horizontal: Vec3 = [toPlayer[0], 0, toPlayer[2]];
            const distance = Math.max(0.001, length(horizontal));
            const direction = scale(horizontal, 1 / distance);
            const strafe: Vec3 = [-direction[2], 0, direction[0]];
            const desiredDistance = 5.5 + Math.sin(enemy.phase) * 1.5;
            const approach = distance > desiredDistance ? 1 : -0.45;
            const speed = 1.1 + this.wave * 0.18;
            enemy.position = add(enemy.position, scale(direction, approach * speed * dt));
            enemy.position = add(
                enemy.position,
                scale(strafe, Math.sin(time * 1.7 + enemy.phase) * dt * 0.85),
            );
            enemy.position[1] = 1.45 + Math.sin(time * 2.4 + enemy.phase) * 0.24;

            enemy.cooldown -= dt;
            if (enemy.cooldown <= 0 && distance < 24) {
                enemy.cooldown = 1.25 + Math.random() * 1.35 - Math.min(0.45, this.wave * 0.04);
                this.enemyFire(enemy);
            }
        }
    }

    private enemyFire(enemy: Enemy): void {
        const from = add(enemy.position, [0, 0.08, 0]);
        const to = this.eyePosition();
        this.beams.push({
            from,
            to,
            age: 0,
            ttl: 0.16,
            width: 0.045,
            color: [1, 0.08, 0.18, 0.68],
            emissive: 2.2,
        });

        const damage = 4 + Math.min(8, this.wave);
        this.player.health = Math.max(0, this.player.health - damage);
        this.damageFlash = 1;
        this.audio.playerHit();
        if (this.player.health === 0) {
            this.respawnPlayer();
        }
    }

    private updateGrenades(dt: number): void {
        for (let index = this.grenades.length - 1; index >= 0; index -= 1) {
            const grenade = this.grenades[index];
            grenade.age += dt;
            grenade.previousPosition = grenade.position;
            grenade.velocity = add(grenade.velocity, [0, -GRENADE_GRAVITY * dt, 0]);
            grenade.position = add(grenade.position, scale(grenade.velocity, dt));
            grenade.spin += dt * 9;

            const hitGround = grenade.position[1] <= GRENADE_RADIUS;
            const hitBoundary =
                Math.abs(grenade.position[0]) > ARENA_X ||
                grenade.position[2] > ARENA_Z_BACK ||
                grenade.position[2] < ARENA_Z_FRONT;
            const hitEnemy = this.enemies.some(
                (enemy) =>
                    enemy.health > 0 &&
                    this.distanceToSegment(
                        enemy.position,
                        grenade.previousPosition,
                        grenade.position,
                    ) <=
                        enemy.radius + GRENADE_RADIUS,
            );

            if (hitGround || hitBoundary || hitEnemy || grenade.age >= grenade.ttl) {
                this.explodeGrenade(grenade.position);
                this.grenades.splice(index, 1);
            }
        }
    }

    private explodeGrenade(position: Vec3): void {
        const blastPosition: Vec3 = [position[0], Math.max(0.42, position[1]), position[2]];
        this.explosions.push({ position: blastPosition, age: 0, ttl: 0.62, size: 1.55 });
        this.audio.enemyDown();

        for (const enemy of this.enemies) {
            if (enemy.health <= 0) {
                continue;
            }
            const distanceToBlast = length(sub(enemy.position, blastPosition));
            if (distanceToBlast > GRENADE_BLAST_RADIUS) {
                continue;
            }
            const damage = Math.round(130 * (1 - distanceToBlast / GRENADE_BLAST_RADIUS) + 38);
            enemy.health -= damage;
            enemy.hitFlash = 0.24;
            if (enemy.health <= 0) {
                this.player.kills += 1;
                this.nextWaveTimer = 1.35;
            }
        }

        for (let index = 0; index < 34; index += 1) {
            const angle = Math.random() * Math.PI * 2;
            const lift = 0.32 + Math.random() * 0.92;
            const speed = 3.2 + Math.random() * 7.8;
            const spread = Math.sqrt(Math.random());
            this.cacaParticles.push({
                position: add(blastPosition, [
                    Math.cos(angle) * spread * 0.4,
                    Math.random() * 0.5,
                    Math.sin(angle) * spread * 0.4,
                ]),
                velocity: [
                    Math.cos(angle) * speed * spread,
                    lift * speed,
                    Math.sin(angle) * speed * spread,
                ],
                age: 0,
                ttl: 0.75 + Math.random() * 0.75,
                size: 0.42 + Math.random() * 0.72,
                rotation: Math.random() * Math.PI * 2,
                spin: (Math.random() - 0.5) * 8,
            });
        }
    }

    private updateEffects(dt: number): void {
        for (let index = this.beams.length - 1; index >= 0; index -= 1) {
            this.beams[index].age += dt;
            if (this.beams[index].age >= this.beams[index].ttl) {
                this.beams.splice(index, 1);
            }
        }

        for (let index = this.explosions.length - 1; index >= 0; index -= 1) {
            this.explosions[index].age += dt;
            if (this.explosions[index].age >= this.explosions[index].ttl) {
                this.explosions.splice(index, 1);
            }
        }

        for (let index = this.cacaParticles.length - 1; index >= 0; index -= 1) {
            const particle = this.cacaParticles[index];
            particle.age += dt;
            particle.velocity = add(particle.velocity, [0, -GRENADE_GRAVITY * 0.62 * dt, 0]);
            particle.position = add(particle.position, scale(particle.velocity, dt));
            particle.rotation += particle.spin * dt;
            if (particle.position[1] < 0.12) {
                particle.position[1] = 0.12;
                particle.velocity[1] *= -0.18;
                particle.velocity[0] *= 0.74;
                particle.velocity[2] *= 0.74;
            }
            if (particle.age >= particle.ttl) {
                this.cacaParticles.splice(index, 1);
            }
        }
    }

    private respawnPlayer(): void {
        this.player.health = 100;
        this.player.position = [0, 1.62, 3.3];
        this.player.yaw = 0;
        this.player.pitch = -0.04;
        this.player.ammo = MAX_AMMO;
        this.reloadTimer = 0;
        this.radioLine = "Armure relancee. Reprends le terrain.";
        this.explosions.push({ position: [0, 1.2, 3.3], age: 0, ttl: 0.8, size: 1.7 });
    }

    private spawnWave(): void {
        const count = 4 + this.wave * 2;
        for (let index = 0; index < count; index += 1) {
            const row = Math.floor(index / 4);
            const column = index % 4;
            const x = -9 + column * 6 + ((index * 13) % 3) * 0.75;
            const z = -13 - row * 5.2 - (index % 2) * 2.2;
            this.enemies.push({
                position: [x, 1.45, z],
                health: 92 + this.wave * 12,
                radius: 0.72,
                phase: index * 1.31 + this.wave,
                cooldown: 0.7 + index * 0.24,
                hitFlash: 0,
            });
        }
    }

    private drawArena(time: number): void {
        this.renderer.drawMesh(
            this.plane,
            fromTRS([0, 0, -18], [0, 0, 0], [72, 1, 70]),
            [0.24, 0.22, 0.17, 1],
            0,
            0.95,
        );
        this.renderer.drawMesh(
            this.plane,
            fromTRS([0, 0.018, -18], [0, 0.32, 0], [15, 1, 80]),
            [0.15, 0.15, 0.14, 1],
            0,
            0.9,
        );
        this.renderer.drawMesh(
            this.box,
            fromTRS([0, 0.1, 4.75], [-0.92, 0, 0], [3.3, 0.14, 3.6]),
            [0.09, 0.095, 0.105, 1],
            0,
            0.4,
        );
        this.renderer.drawMesh(
            this.box,
            fromTRS([0, 1.35, 6.6], [0.18, 0, 0], [4.4, 2.7, 2.2]),
            [0.12, 0.12, 0.13, 1],
            0,
            0.5,
        );

        for (let i = 0; i < 30; i += 1) {
            const side = i % 2 === 0 ? -1 : 1;
            const row = Math.floor(i / 2);
            const height = 1.2 + ((i * 17) % 8) * 0.62;
            const x = side * (4.4 + ((i * 7) % 5) * 1.55);
            const z = -3.7 - row * 3.05;
            const tilt = ((i % 5) - 2) * 0.035;
            this.renderer.drawMesh(
                this.box,
                fromTRS([x, height / 2, z], [tilt, 0.04 * i, -tilt], [1.25, height, 1.2]),
                [0.22, 0.21, 0.22, 1],
                0,
                0.86,
            );
            if (i % 4 === 0) {
                this.renderer.drawMesh(
                    this.box,
                    fromTRS([x, height + 0.08, z], [0, 0.04 * i, 0], [1.35, 0.16, 1.25]),
                    [0.95, 0.16, 0.12, 0.78],
                    1.25,
                    0.78,
                );
            }
        }

        for (let i = 0; i < 10; i += 1) {
            const x = -14 + i * 3.1;
            const z = -10 - (i % 4) * 7.8;
            const pulse = 0.7 + Math.sin(time * 3.5 + i) * 0.3;
            this.renderer.drawMesh(
                this.box,
                fromTRS([x, 0.45, z], [0, i * 0.4, 0], [0.24, 0.9, 0.24]),
                [1, 0.18, 0.1, 0.18 + pulse * 0.12],
                1.8,
                0.62,
            );
        }
    }

    private drawEnemies(time: number): void {
        for (const enemy of this.enemies) {
            if (enemy.health <= 0) {
                continue;
            }
            const toPlayer = sub(this.player.position, enemy.position);
            const yaw = Math.atan2(toPlayer[0], toPlayer[2]);
            const flash = enemy.hitFlash > 0 ? 1 : 0;
            const bodyColor: [number, number, number, number] = flash
                ? [1, 0.95, 0.76, 1]
                : [0.045, 0.06, 0.075, 1];
            const coreColor: [number, number, number, number] = flash
                ? [1, 0.5, 0.18, 1]
                : [1, 0.05, 0.16, 0.9];
            const bob = Math.sin(time * 4.3 + enemy.phase) * 0.08;
            const position: Vec3 = [enemy.position[0], enemy.position[1] + bob, enemy.position[2]];
            this.renderer.drawMesh(
                this.pyramid,
                fromTRS(position, [Math.PI, yaw, 0.08], [1, 0.78, 1.65]),
                bodyColor,
                flash * 1.2,
                0.65,
            );
            this.renderer.drawMesh(
                this.box,
                fromTRS(add(position, [0, -0.08, 0]), [0, yaw, 0], [1.25, 0.08, 2.1]),
                coreColor,
                1.7 + flash,
                0.55,
            );
            this.renderer.drawMesh(
                this.sphere,
                fromTRS(add(position, [0, -0.16, 0]), [0, 0, 0], [0.28, 0.28, 0.28]),
                coreColor,
                1.5 + flash,
                0.55,
            );
        }
    }

    private drawEffects(time: number): void {
        for (const grenade of this.grenades) {
            this.drawGrenade(grenade);
        }

        for (const beam of this.beams) {
            const fade = 1 - beam.age / beam.ttl;
            this.drawAlienBeam(
                beam.from,
                beam.to,
                beam.width * (0.55 + fade),
                [beam.color[0], beam.color[1], beam.color[2], beam.color[3] * fade],
                beam.emissive,
            );
        }

        for (const explosion of this.explosions) {
            const t = clamp01(explosion.age / explosion.ttl);
            const size = explosion.size * (0.35 + t * 1.4);
            const alpha = 1 - t;
            this.renderer.drawMesh(
                this.sphere,
                fromTRS(explosion.position, [0, time * 4, 0], [size, size, size]),
                [1, 0.35 + t * 0.25, 0.08, 0.68 * alpha],
                2.4,
                0.45,
            );
        }

        for (const particle of this.cacaParticles) {
            const t = clamp01(particle.age / particle.ttl);
            const alpha = 1 - t;
            const squash = 1 + t * 0.42;
            this.renderer.drawBillboard(
                this.cacaTexture,
                particle.position,
                [particle.size * 1.52 * squash, particle.size],
                [1, 0.92, 0.72, alpha],
                particle.rotation,
            );
        }
    }

    private drawGrenade(grenade: Grenade): void {
        const flightPulse = 1 + Math.sin(grenade.age * 18) * 0.05;
        this.renderer.drawBillboard(
            this.projectileTexture,
            grenade.position,
            [GRENADE_RADIUS * 2.75 * flightPulse, GRENADE_RADIUS * 2.75],
            [1, 1, 1, 1],
            grenade.spin,
            true,
        );
    }

    private drawWeapon(time: number): void {
        const muzzle = this.weaponMuzzle();
        const eye = this.eyePosition();
        const look = this.lookDirection();
        const right = this.right();
        const bob =
            (Math.sin(time * 9) * 0.015 + Math.sin(time * 4.5) * 0.02) * Number(this.active);
        const base = add(add(add(eye, scale(look, 0.78)), scale(right, 0.43)), [0, -0.33 + bob, 0]);
        const rotation: Vec3 = [this.player.pitch - 0.08, this.player.yaw, 0.02];
        this.renderer.drawMesh(
            this.box,
            fromTRS(base, rotation, [0.45, 0.28, 1.35]),
            [0.11, 0.12, 0.13, 1],
            0.08,
            0.18,
        );
        this.renderer.drawMesh(
            this.box,
            fromTRS(add(base, scale(look, 0.44)), rotation, [0.25, 0.2, 0.72]),
            [0.2, 0.34, 0.16, 1],
            0.45,
            0.18,
        );

        const charge = this.grenadeCharge();
        if (this.input.isPrimaryDown) {
            const chargePulse = 0.26 + charge * 0.34 + Math.sin(time * 18) * 0.025;
            const heldGrenade = add(add(base, scale(look, 0.9)), scale(right, 0.02));
            this.renderer.drawBillboard(
                this.projectileTexture,
                heldGrenade,
                [chargePulse * 2.1, chargePulse * 2.1],
                [1, 1, 1, 1],
                time * 5,
                true,
            );
        } else if (this.shotCooldown > 0.25) {
            this.renderer.drawMesh(
                this.box,
                fromTRS(add(muzzle, scale(look, 0.08)), rotation, [0.36, 0.2, 0.38]),
                [0.68, 0.95, 0.38, 0.46],
                1.2,
                0.12,
            );
        }
    }

    private drawAlienBeam(
        from: Vec3,
        to: Vec3,
        width: number,
        color: [number, number, number, number],
        emissive: number,
    ): void {
        const delta = sub(to, from);
        const distance = Math.max(0.001, length(delta));
        const center = add(from, scale(delta, 0.5));
        const yaw = Math.atan2(delta[0], delta[2]);
        const horizontal = Math.hypot(delta[0], delta[2]);
        const pitch = -Math.atan2(delta[1], horizontal);
        this.renderer.drawMesh(
            this.box,
            fromTRS(center, [pitch, yaw, 0], [width, width, distance]),
            color,
            emissive,
            0.2,
        );
    }

    private updateHud(time: number): void {
        this.hud.helmet.classList.toggle(
            "alarm",
            this.damageFlash > 0.35 || this.player.health <= 28,
        );
        this.hud.phase.textContent = `VAGUE ${this.wave}`;
        this.hud.velocity.textContent = `ARMURE ${Math.round(this.player.health)}%`;
        const charge = this.grenadeCharge();
        const ammoText = this.reloadTimer > 0 ? "RECHARGE" : `${this.player.ammo}/${MAX_AMMO}`;
        this.hud.altitude.textContent = `MUN ${ammoText}`;
        const aliveEnemies = this.enemies.filter((enemy) => enemy.health > 0).length;
        this.hud.signal.textContent = `MENACES ${aliveEnemies}`;
        this.hud.mission.textContent = this.input.isPrimaryDown
            ? `Charge grenade ${Math.round(charge * 100)}%`
            : aliveEnemies > 0
              ? "Nettoyer la zone"
              : "Tenir la position";
        const text = this.radioLine;
        const visibleChars = Math.min(text.length, Math.floor((time * 18) % (text.length + 16)));
        this.hud.radioMessage.textContent = text.slice(0, visibleChars);
    }

    private grenadeCharge(): number {
        return clamp01(this.input.primaryHoldSeconds(performance.now()) / MAX_GRENADE_CHARGE);
    }

    private distanceToSegment(point: Vec3, start: Vec3, end: Vec3): number {
        const segment = sub(end, start);
        const segmentLengthSquared = Math.max(0.0001, dot(segment, segment));
        const t = clamp01(dot(sub(point, start), segment) / segmentLengthSquared);
        return length(sub(point, add(start, scale(segment, t))));
    }

    private eyePosition(): Vec3 {
        return this.player.position;
    }

    private lookDirection(): Vec3 {
        const cosPitch = Math.cos(this.player.pitch);
        return normalize([
            Math.sin(this.player.yaw) * cosPitch,
            Math.sin(this.player.pitch),
            -Math.cos(this.player.yaw) * cosPitch,
        ]);
    }

    private flatForward(): Vec3 {
        return normalize([Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw)]);
    }

    private right(): Vec3 {
        return normalize([Math.cos(this.player.yaw), 0, Math.sin(this.player.yaw)]);
    }

    private weaponMuzzle(): Vec3 {
        const eye = this.eyePosition();
        return add(
            add(add(eye, scale(this.lookDirection(), 1.26)), scale(this.right(), 0.44)),
            [0, -0.27, 0],
        );
    }
}
