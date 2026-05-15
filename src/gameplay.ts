import { AudioFX } from "./audio";
import {
    CITY_BLOCK_SIZE,
    CITY_SECTOR_SIZE,
    STREET_HALF_WIDTH,
    collectBuildings,
    generateCitySector,
    getSectorsAround,
    getStreetWaypoint,
    isLineBlockedByBuildings,
    nearestStreetPoint,
    resolveCircleAgainstBuildings,
    sectorKey,
    worldToSector,
    type Building,
    type CitySector,
} from "./city";
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
    waypoint: Vec3;
    health: number;
    radius: number;
    phase: number;
    cooldown: number;
    hitFlash: number;
    pathTimer: number;
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
const PLAYER_RADIUS = 0.48;
const ENEMY_RADIUS = 0.72;
const ACTIVE_SECTOR_RADIUS = 2;
const CITY_KEEP_RADIUS = ACTIVE_SECTOR_RADIUS + 1;
const ENEMY_SPAWN_MIN_DISTANCE = 34;
const ENEMY_SPAWN_MAX_DISTANCE = 78;
const ENEMY_DESPAWN_DISTANCE = CITY_SECTOR_SIZE * 3.35;

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
    private readonly citySectors = new Map<string, CitySector>();
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
    private threatLevel = 1;
    private spawnTimer = 0;
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
        this.threatLevel = 1;
        this.spawnTimer = 0.4;
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
        this.citySectors.clear();
        this.updateCitySectors();
        for (let index = 0; index < 5; index += 1) {
            this.spawnEnemy(0);
        }
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

        this.drawCity(time);
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
        this.updateCitySectors();

        const movement = add(scale(forward, moveForward), scale(right, moveRight));
        const movementLength = length(movement);
        if (movementLength > 0.001) {
            const sprint = this.input.isDown("ShiftLeft") || this.input.isDown("ShiftRight");
            const speed = sprint ? 7.2 : 4.85;
            this.movePlayer(scale(movement, (speed * dt) / movementLength));
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

        this.threatLevel = 1 + Math.floor(time / 45) + Math.floor(this.player.kills / 8);
        this.updateSpawning(dt, time);
        this.updateEnemies(dt, time);
        this.updateGrenades(dt);
        this.removeDeadEnemies();
        this.updateEffects(dt);
        this.damageFlash = Math.max(0, this.damageFlash - dt * 2.6);
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
        const buildings = this.cityBuildings();
        const playerStreet = nearestStreetPoint(this.player.position);

        for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
            const enemy = this.enemies[index];
            if (enemy.health <= 0) {
                continue;
            }

            enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
            const toPlayer = sub(this.player.position, enemy.position);
            const horizontal: Vec3 = [toPlayer[0], 0, toPlayer[2]];
            const distance = Math.max(0.001, length(horizontal));
            if (distance > ENEMY_DESPAWN_DISTANCE) {
                this.enemies.splice(index, 1);
                continue;
            }

            const lineBlocked = isLineBlockedByBuildings(
                add(enemy.position, [0, 0.08, 0]),
                this.eyePosition(),
                buildings,
                0.32,
            );
            enemy.pathTimer -= dt;

            const desiredDistance = 5.5 + Math.sin(enemy.phase) * 1.5;
            let direction: Vec3;
            let speed = 1.25 + this.threatLevel * 0.14;
            if (!lineBlocked && distance < 26) {
                direction = scale(horizontal, 1 / distance);
                const strafe: Vec3 = [-direction[2], 0, direction[0]];
                const approach = distance > desiredDistance ? 1 : -0.42;
                direction = normalize(
                    add(direction, scale(strafe, Math.sin(time * 1.7 + enemy.phase) * 0.32)),
                );
                speed *= approach;
                enemy.waypoint = playerStreet;
            } else {
                const waypointDistance = length(sub(enemy.waypoint, enemy.position));
                if (enemy.pathTimer <= 0 || waypointDistance < 1.25) {
                    enemy.waypoint = getStreetWaypoint(enemy.position, playerStreet);
                    enemy.pathTimer = 0.35 + Math.random() * 0.24;
                }
                const toWaypoint = sub(enemy.waypoint, enemy.position);
                const waypointLength = Math.max(0.001, length([toWaypoint[0], 0, toWaypoint[2]]));
                direction = [toWaypoint[0] / waypointLength, 0, toWaypoint[2] / waypointLength];
            }

            const nextPosition = add(enemy.position, scale(direction, speed * dt));
            enemy.position = resolveCircleAgainstBuildings(nextPosition, enemy.radius, buildings);
            enemy.position[1] = 1.45 + Math.sin(time * 2.4 + enemy.phase) * 0.24;

            enemy.cooldown -= dt;
            if (enemy.cooldown <= 0 && distance < 28 && !lineBlocked) {
                enemy.cooldown =
                    1.15 + Math.random() * 1.2 - Math.min(0.42, this.threatLevel * 0.035);
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

        const damage = 4 + Math.min(8, this.threatLevel);
        this.player.health = Math.max(0, this.player.health - damage);
        this.damageFlash = 1;
        this.audio.playerHit();
        if (this.player.health === 0) {
            this.respawnPlayer();
        }
    }

    private updateGrenades(dt: number): void {
        const buildings = this.cityBuildings();
        for (let index = this.grenades.length - 1; index >= 0; index -= 1) {
            const grenade = this.grenades[index];
            grenade.age += dt;
            grenade.previousPosition = grenade.position;
            grenade.velocity = add(grenade.velocity, [0, -GRENADE_GRAVITY * dt, 0]);
            grenade.position = add(grenade.position, scale(grenade.velocity, dt));
            grenade.spin += dt * 9;

            const hitGround = grenade.position[1] <= GRENADE_RADIUS;
            const hitBuilding = isLineBlockedByBuildings(
                grenade.previousPosition,
                grenade.position,
                buildings.filter(
                    (building) =>
                        Math.min(grenade.previousPosition[1], grenade.position[1]) <=
                        building.height + GRENADE_RADIUS,
                ),
                GRENADE_RADIUS,
            );
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

            if (hitGround || hitBuilding || hitEnemy || grenade.age >= grenade.ttl) {
                this.explodeGrenade(grenade.position);
                this.grenades.splice(index, 1);
            }
        }
    }

    private explodeGrenade(position: Vec3): void {
        const blastPosition: Vec3 = [position[0], Math.max(0.42, position[1]), position[2]];
        this.explosions.push({ position: blastPosition, age: 0, ttl: 0.62, size: 1.55 });
        this.audio.enemyDown();
        const buildings = this.cityBuildings();

        for (const enemy of this.enemies) {
            if (enemy.health <= 0) {
                continue;
            }
            const distanceToBlast = length(sub(enemy.position, blastPosition));
            if (distanceToBlast > GRENADE_BLAST_RADIUS) {
                continue;
            }
            if (
                isLineBlockedByBuildings(
                    blastPosition,
                    enemy.position,
                    buildings,
                    Math.min(0.5, enemy.radius),
                )
            ) {
                continue;
            }
            const damage = Math.round(130 * (1 - distanceToBlast / GRENADE_BLAST_RADIUS) + 38);
            enemy.health -= damage;
            enemy.hitFlash = 0.24;
            if (enemy.health <= 0) {
                this.player.kills += 1;
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
        this.updateCitySectors();
        this.radioLine = "Armure relancee. Reprends le terrain.";
        this.explosions.push({ position: [0, 1.2, 3.3], age: 0, ttl: 0.8, size: 1.7 });
    }

    private updateCitySectors(): void {
        for (const [sx, sz] of getSectorsAround(this.player.position, ACTIVE_SECTOR_RADIUS)) {
            const key = sectorKey(sx, sz);
            if (!this.citySectors.has(key)) {
                this.citySectors.set(key, generateCitySector(sx, sz));
            }
        }

        const keep = new Set(
            getSectorsAround(this.player.position, CITY_KEEP_RADIUS).map(([sx, sz]) =>
                sectorKey(sx, sz),
            ),
        );
        for (const key of this.citySectors.keys()) {
            if (!keep.has(key)) {
                this.citySectors.delete(key);
            }
        }
    }

    private updateSpawning(dt: number, time: number): void {
        this.spawnTimer -= dt;
        if (this.spawnTimer > 0) {
            return;
        }

        const aliveEnemies = this.aliveEnemyCount();
        const targetCount = this.maxActiveEnemies();
        const spawnInterval = Math.max(0.52, 2.1 - this.threatLevel * 0.09);
        this.spawnTimer = spawnInterval + Math.random() * 0.75;
        if (aliveEnemies >= targetCount) {
            return;
        }

        this.spawnEnemy(time);
    }

    private spawnEnemy(time: number): void {
        const buildings = this.cityBuildings();
        for (let attempt = 0; attempt < 18; attempt += 1) {
            const angle = Math.random() * Math.PI * 2;
            const distance =
                ENEMY_SPAWN_MIN_DISTANCE +
                Math.random() * (ENEMY_SPAWN_MAX_DISTANCE - ENEMY_SPAWN_MIN_DISTANCE);
            const rawPosition: Vec3 = [
                this.player.position[0] + Math.cos(angle) * distance,
                1.45,
                this.player.position[2] + Math.sin(angle) * distance,
            ];
            const spawnPosition = resolveCircleAgainstBuildings(
                nearestStreetPoint(rawPosition),
                ENEMY_RADIUS,
                buildings,
            );
            const toPlayer = sub(this.player.position, spawnPosition);
            const playerDistance = length([toPlayer[0], 0, toPlayer[2]]);
            if (playerDistance < ENEMY_SPAWN_MIN_DISTANCE) {
                continue;
            }
            if (
                playerDistance < 48 &&
                !isLineBlockedByBuildings(spawnPosition, this.eyePosition(), buildings, 0.4)
            ) {
                continue;
            }

            this.enemies.push({
                position: spawnPosition,
                waypoint: getStreetWaypoint(spawnPosition, this.player.position),
                health: 92 + this.threatLevel * 10,
                radius: ENEMY_RADIUS,
                phase: time * 1.7 + Math.random() * Math.PI * 2,
                cooldown: 0.45 + Math.random() * 1.3,
                hitFlash: 0,
                pathTimer: 0,
            });
            return;
        }
    }

    private movePlayer(delta: Vec3): void {
        const buildings = this.cityBuildings();
        const nextX: Vec3 = [
            this.player.position[0] + delta[0],
            this.player.position[1],
            this.player.position[2],
        ];
        this.player.position = resolveCircleAgainstBuildings(nextX, PLAYER_RADIUS, buildings);

        const nextZ: Vec3 = [
            this.player.position[0],
            this.player.position[1],
            this.player.position[2] + delta[2],
        ];
        this.player.position = resolveCircleAgainstBuildings(nextZ, PLAYER_RADIUS, buildings);
    }

    private cityBuildings(): Building[] {
        return collectBuildings([...this.citySectors.values()]);
    }

    private aliveEnemyCount(): number {
        return this.enemies.filter((enemy) => enemy.health > 0).length;
    }

    private maxActiveEnemies(): number {
        return Math.min(24, 8 + this.threatLevel * 2);
    }

    private removeDeadEnemies(): void {
        for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
            if (this.enemies[index].health <= 0) {
                this.enemies.splice(index, 1);
            }
        }
    }

    private drawCity(time: number): void {
        const roadWidth = STREET_HALF_WIDTH * 2;
        for (const sector of this.citySectors.values()) {
            const centerX = (sector.bounds.minX + sector.bounds.maxX) / 2;
            const centerZ = (sector.bounds.minZ + sector.bounds.maxZ) / 2;
            this.renderer.drawMesh(
                this.plane,
                fromTRS([centerX, 0, centerZ], [0, 0, 0], [CITY_SECTOR_SIZE, 1, CITY_SECTOR_SIZE]),
                [0.115, 0.108, 0.102, 1],
                0,
                0.95,
            );

            for (let line = 0; line <= CITY_SECTOR_SIZE / CITY_BLOCK_SIZE; line += 1) {
                const x = sector.bounds.minX + line * CITY_BLOCK_SIZE;
                const z = sector.bounds.minZ + line * CITY_BLOCK_SIZE;
                this.renderer.drawMesh(
                    this.plane,
                    fromTRS([x, 0.018, centerZ], [0, 0, 0], [roadWidth, 1, CITY_SECTOR_SIZE]),
                    [0.045, 0.045, 0.048, 1],
                    0,
                    0.88,
                );
                this.renderer.drawMesh(
                    this.plane,
                    fromTRS([centerX, 0.02, z], [0, 0, 0], [CITY_SECTOR_SIZE, 1, roadWidth]),
                    [0.045, 0.045, 0.048, 1],
                    0,
                    0.88,
                );
                this.renderer.drawMesh(
                    this.plane,
                    fromTRS([x, 0.024, centerZ], [0, 0, 0], [0.14, 1, CITY_SECTOR_SIZE]),
                    [0.95, 0.18, 0.12, 0.18],
                    1.1,
                    0.72,
                );
                this.renderer.drawMesh(
                    this.plane,
                    fromTRS([centerX, 0.026, z], [0, 0, 0], [CITY_SECTOR_SIZE, 1, 0.14]),
                    [0.95, 0.18, 0.12, 0.18],
                    1.1,
                    0.72,
                );
            }

            for (const building of sector.buildings) {
                this.drawBuilding(building, time);
            }
        }
    }

    private drawBuilding(building: Building, time: number): void {
        const width = building.bounds.maxX - building.bounds.minX;
        const depth = building.bounds.maxZ - building.bounds.minZ;
        const centerX = (building.bounds.minX + building.bounds.maxX) / 2;
        const centerZ = (building.bounds.minZ + building.bounds.maxZ) / 2;
        const height = building.height;
        const flicker = 0.78 + Math.sin(time * 3.3 + building.seed * 0.001) * 0.22;
        this.renderer.drawMesh(
            this.box,
            fromTRS([centerX, height / 2, centerZ], [0, 0, 0], [width, height, depth]),
            [building.color[0], building.color[1], building.color[2], 1],
            0,
            0.72,
        );
        this.renderer.drawMesh(
            this.box,
            fromTRS(
                [centerX, height + 0.04, centerZ],
                [0, 0, 0],
                [width * 1.04, 0.08, depth * 1.04],
            ),
            [0.065, 0.068, 0.075, 1],
            0.15,
            0.58,
        );

        if (building.seed % 3 === 0) {
            this.renderer.drawMesh(
                this.box,
                fromTRS(
                    [centerX, height * 0.52, building.bounds.minZ - 0.035],
                    [0, 0, 0],
                    [Math.max(0.7, width * 0.16), height * 0.58, 0.06],
                ),
                [0.95, 0.18 + flicker * 0.24, 0.12, 0.48],
                1.2 * flicker,
                0.5,
            );
        }

        if (building.seed % 5 === 0) {
            this.renderer.drawMesh(
                this.box,
                fromTRS(
                    [building.bounds.maxX + 0.035, height * 0.48, centerZ],
                    [0, 0, 0],
                    [0.06, height * 0.48, Math.max(0.8, depth * 0.18)],
                ),
                [0.28, 0.74, 0.95, 0.36],
                0.95 * flicker,
                0.54,
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
        const [sectorX, sectorZ] = worldToSector(this.player.position);
        this.hud.phase.textContent = `VILLE ${sectorX}:${sectorZ}`;
        this.hud.velocity.textContent = `ARMURE ${Math.round(this.player.health)}%`;
        const charge = this.grenadeCharge();
        const ammoText = this.reloadTimer > 0 ? "RECHARGE" : `${this.player.ammo}/${MAX_AMMO}`;
        this.hud.altitude.textContent = `MUN ${ammoText}`;
        const aliveEnemies = this.aliveEnemyCount();
        this.hud.signal.textContent = `MENACES ${aliveEnemies}/${this.maxActiveEnemies()}`;
        this.hud.mission.textContent = this.input.isPrimaryDown
            ? `Charge grenade ${Math.round(charge * 100)}%`
            : aliveEnemies > 0
              ? `Survivre menace ${this.threatLevel}`
              : "Reperer les rues";
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
