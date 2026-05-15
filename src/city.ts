import type { Vec3 } from "./math";

export interface Rect2 {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

export interface Building {
    bounds: Rect2;
    height: number;
    color: [number, number, number];
    seed: number;
}

export interface CitySector {
    sx: number;
    sz: number;
    bounds: Rect2;
    buildings: Building[];
}

export const CITY_SECTOR_SIZE = 48;
export const CITY_BLOCK_SIZE = 16;
export const STREET_HALF_WIDTH = 3.4;
export const BUILDING_COLLISION_PADDING = 0.04;

const BLOCKS_PER_SECTOR = CITY_SECTOR_SIZE / CITY_BLOCK_SIZE;

export const sectorKey = (sx: number, sz: number): string => `${sx}:${sz}`;

export const worldToSector = (position: Vec3): [number, number] => [
    Math.floor(position[0] / CITY_SECTOR_SIZE),
    Math.floor(position[2] / CITY_SECTOR_SIZE),
];

export const getSectorsAround = (position: Vec3, radius: number): Array<[number, number]> => {
    const [centerX, centerZ] = worldToSector(position);
    const sectors: Array<[number, number]> = [];
    for (let z = centerZ - radius; z <= centerZ + radius; z += 1) {
        for (let x = centerX - radius; x <= centerX + radius; x += 1) {
            sectors.push([x, z]);
        }
    }
    return sectors;
};

export const generateCitySector = (sx: number, sz: number): CitySector => {
    const minX = sx * CITY_SECTOR_SIZE;
    const minZ = sz * CITY_SECTOR_SIZE;
    const buildings: Building[] = [];

    for (let blockZ = 0; blockZ < BLOCKS_PER_SECTOR; blockZ += 1) {
        for (let blockX = 0; blockX < BLOCKS_PER_SECTOR; blockX += 1) {
            const seed = hashInts(sx, sz, blockX, blockZ);
            if (random01(seed, 0) < 0.08) {
                continue;
            }

            const blockMinX = minX + blockX * CITY_BLOCK_SIZE;
            const blockMinZ = minZ + blockZ * CITY_BLOCK_SIZE;
            const insetLeft = STREET_HALF_WIDTH + 0.65 + random01(seed, 1) * 1.05;
            const insetRight = STREET_HALF_WIDTH + 0.65 + random01(seed, 2) * 1.05;
            const insetBack = STREET_HALF_WIDTH + 0.65 + random01(seed, 3) * 1.05;
            const insetFront = STREET_HALF_WIDTH + 0.65 + random01(seed, 4) * 1.05;
            const bounds: Rect2 = {
                minX: blockMinX + insetLeft,
                maxX: blockMinX + CITY_BLOCK_SIZE - insetRight,
                minZ: blockMinZ + insetBack,
                maxZ: blockMinZ + CITY_BLOCK_SIZE - insetFront,
            };

            if (bounds.maxX - bounds.minX < 3 || bounds.maxZ - bounds.minZ < 3) {
                continue;
            }

            const neon = random01(seed, 8);
            buildings.push({
                bounds,
                height: 3.5 + random01(seed, 5) * 13.5,
                color: [
                    0.11 + neon * 0.12,
                    0.105 + random01(seed, 6) * 0.08,
                    0.12 + random01(seed, 7) * 0.1,
                ],
                seed,
            });
        }
    }

    return {
        sx,
        sz,
        bounds: {
            minX,
            maxX: minX + CITY_SECTOR_SIZE,
            minZ,
            maxZ: minZ + CITY_SECTOR_SIZE,
        },
        buildings,
    };
};

export const collectBuildings = (sectors: CitySector[]): Building[] =>
    sectors.flatMap((sector) => sector.buildings);

export const isStreetPoint = (x: number, z: number): boolean =>
    distanceToStreetLine(x) <= STREET_HALF_WIDTH || distanceToStreetLine(z) <= STREET_HALF_WIDTH;

export const nearestStreetPoint = (position: Vec3): Vec3 => {
    if (isStreetPoint(position[0], position[2])) {
        return [...position];
    }

    const nearestX = nearestStreetLine(position[0]);
    const nearestZ = nearestStreetLine(position[2]);
    const dx = Math.abs(nearestX - position[0]);
    const dz = Math.abs(nearestZ - position[2]);
    return dx <= dz ? [nearestX, position[1], position[2]] : [position[0], position[1], nearestZ];
};

export const getStreetWaypoint = (from: Vec3, to: Vec3): Vec3 => {
    const current = nearestStreetPoint(from);
    const target = nearestStreetPoint(to);
    const targetXStreet = nearestStreetLine(target[0]);
    const targetZStreet = nearestStreetLine(target[2]);
    const sameStreet =
        Math.abs(current[0] - target[0]) <= STREET_HALF_WIDTH ||
        Math.abs(current[2] - target[2]) <= STREET_HALF_WIDTH;

    if (sameStreet) {
        return [target[0], from[1], target[2]];
    }

    const onVerticalStreet = distanceToStreetLine(current[0]) <= STREET_HALF_WIDTH;
    const onHorizontalStreet = distanceToStreetLine(current[2]) <= STREET_HALF_WIDTH;

    if (onVerticalStreet && Math.abs(current[2] - targetZStreet) > STREET_HALF_WIDTH) {
        return [current[0], from[1], targetZStreet];
    }
    if (onHorizontalStreet && Math.abs(current[0] - targetXStreet) > STREET_HALF_WIDTH) {
        return [targetXStreet, from[1], current[2]];
    }

    const horizontalFirst = Math.abs(target[0] - current[0]) > Math.abs(target[2] - current[2]);
    return horizontalFirst
        ? [targetXStreet, from[1], current[2]]
        : [current[0], from[1], targetZStreet];
};

export const circleIntersectsRect = (position: Vec3, radius: number, rect: Rect2): boolean => {
    const closestX = clamp(position[0], rect.minX, rect.maxX);
    const closestZ = clamp(position[2], rect.minZ, rect.maxZ);
    const dx = position[0] - closestX;
    const dz = position[2] - closestZ;
    return dx * dx + dz * dz < radius * radius;
};

export const resolveCircleAgainstBuildings = (
    position: Vec3,
    radius: number,
    buildings: Building[],
): Vec3 => {
    let resolved: Vec3 = [...position];
    for (let pass = 0; pass < 3; pass += 1) {
        for (const building of buildings) {
            resolved = resolveCircleAgainstRect(resolved, radius, building.bounds);
        }
    }
    return resolved;
};

export const isLineBlockedByBuildings = (
    from: Vec3,
    to: Vec3,
    buildings: Building[],
    padding = 0,
): boolean =>
    buildings.some((building) =>
        lineIntersectsRect(from, to, expandRect(building.bounds, padding)),
    );

const resolveCircleAgainstRect = (position: Vec3, radius: number, rect: Rect2): Vec3 => {
    const insideX = position[0] > rect.minX && position[0] < rect.maxX;
    const insideZ = position[2] > rect.minZ && position[2] < rect.maxZ;
    const padding = radius + BUILDING_COLLISION_PADDING;

    if (insideX && insideZ) {
        const left = position[0] - rect.minX;
        const right = rect.maxX - position[0];
        const back = position[2] - rect.minZ;
        const front = rect.maxZ - position[2];
        const nearest = Math.min(left, right, back, front);
        if (nearest === left) {
            return [rect.minX - padding, position[1], position[2]];
        }
        if (nearest === right) {
            return [rect.maxX + padding, position[1], position[2]];
        }
        if (nearest === back) {
            return [position[0], position[1], rect.minZ - padding];
        }
        return [position[0], position[1], rect.maxZ + padding];
    }

    const closestX = clamp(position[0], rect.minX, rect.maxX);
    const closestZ = clamp(position[2], rect.minZ, rect.maxZ);
    const dx = position[0] - closestX;
    const dz = position[2] - closestZ;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared >= radius * radius || distanceSquared <= 0.000001) {
        return position;
    }

    const distance = Math.sqrt(distanceSquared);
    const push = (radius + BUILDING_COLLISION_PADDING - distance) / distance;
    return [position[0] + dx * push, position[1], position[2] + dz * push];
};

const lineIntersectsRect = (from: Vec3, to: Vec3, rect: Rect2): boolean => {
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    let tMin = 0;
    let tMax = 1;

    const clip = (edge: number, distance: number): boolean => {
        if (Math.abs(edge) < 0.000001) {
            return distance >= 0;
        }
        const t = distance / edge;
        if (edge < 0) {
            if (t > tMax) {
                return false;
            }
            tMin = Math.max(tMin, t);
            return true;
        }
        if (t < tMin) {
            return false;
        }
        tMax = Math.min(tMax, t);
        return true;
    };

    return (
        clip(-dx, from[0] - rect.minX) &&
        clip(dx, rect.maxX - from[0]) &&
        clip(-dz, from[2] - rect.minZ) &&
        clip(dz, rect.maxZ - from[2])
    );
};

const expandRect = (rect: Rect2, padding: number): Rect2 => ({
    minX: rect.minX - padding,
    maxX: rect.maxX + padding,
    minZ: rect.minZ - padding,
    maxZ: rect.maxZ + padding,
});

const nearestStreetLine = (value: number): number =>
    Math.round(value / CITY_BLOCK_SIZE) * CITY_BLOCK_SIZE;

const distanceToStreetLine = (value: number): number => Math.abs(value - nearestStreetLine(value));

const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

const random01 = (seed: number, salt: number): number => {
    let value = seed ^ Math.imul(salt + 1, 0x9e3779b1);
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 0x100000000;
};

const hashInts = (...values: number[]): number => {
    let hash = 0x811c9dc5;
    for (const value of values) {
        hash ^= value | 0;
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};
