import assert from "node:assert/strict";
import test from "node:test";

import {
    CITY_SECTOR_SIZE,
    STREET_HALF_WIDTH,
    circleIntersectsRect,
    generateCitySector,
    getSectorsAround,
    getStreetWaypoint,
    isLineBlockedByBuildings,
    isStreetPoint,
    nearestStreetPoint,
    resolveCircleAgainstBuildings,
    sectorKey,
    worldToSector,
} from "../.test-build/city.js";

test("city sector generation is deterministic", () => {
    const first = generateCitySector(2, -3);
    const second = generateCitySector(2, -3);
    const neighbor = generateCitySector(3, -3);

    assert.deepEqual(second, first);
    assert.notDeepEqual(neighbor.buildings, first.buildings);
    assert.equal(first.bounds.minX, 2 * CITY_SECTOR_SIZE);
    assert.equal(first.bounds.minZ, -3 * CITY_SECTOR_SIZE);
});

test("generated buildings stay inside their sector and outside streets", () => {
    const sector = generateCitySector(-1, 4);

    for (const building of sector.buildings) {
        assert.ok(building.bounds.minX >= sector.bounds.minX);
        assert.ok(building.bounds.maxX <= sector.bounds.maxX);
        assert.ok(building.bounds.minZ >= sector.bounds.minZ);
        assert.ok(building.bounds.maxZ <= sector.bounds.maxZ);

        const centerX = (building.bounds.minX + building.bounds.maxX) / 2;
        const centerZ = (building.bounds.minZ + building.bounds.maxZ) / 2;
        assert.equal(isStreetPoint(centerX, centerZ), false);
        assert.ok(
            building.bounds.minX - nearestStreetPoint([building.bounds.minX, 0, centerZ])[0] >
                STREET_HALF_WIDTH,
        );
    }
});

test("sector helpers cover positions around the player", () => {
    assert.deepEqual(worldToSector([0, 0, 0]), [0, 0]);
    assert.deepEqual(worldToSector([-0.1, 0, -48.1]), [-1, -2]);
    assert.equal(sectorKey(-1, 2), "-1:2");

    const sectors = getSectorsAround([12, 0, -18], 1);
    assert.equal(sectors.length, 9);
    assert.deepEqual(sectors[4], [0, -1]);
});

test("nearest street projection keeps points on the road network", () => {
    const projected = nearestStreetPoint([7.9, 1.5, 7.6]);

    assert.equal(projected[1], 1.5);
    assert.equal(isStreetPoint(projected[0], projected[2]), true);
});

test("street waypoints route along the road grid", () => {
    const waypoint = getStreetWaypoint([0, 1.45, 5], [30, 1.6, 35]);

    assert.equal(waypoint[1], 1.45);
    assert.equal(isStreetPoint(waypoint[0], waypoint[2]), true);
    assert.equal(waypoint[0], 0);
    assert.equal(waypoint[2], 32);
});

test("building collision pushes circles outside while preserving height", () => {
    const building = {
        bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 },
        height: 8,
        color: [0.1, 0.1, 0.1],
        seed: 1,
    };

    const resolved = resolveCircleAgainstBuildings([2, 1.6, 2], 0.5, [building]);

    assert.equal(resolved[1], 1.6);
    assert.equal(circleIntersectsRect(resolved, 0.5, building.bounds), false);
});

test("line of sight detects buildings between alien and player", () => {
    const building = {
        bounds: { minX: 0, maxX: 4, minZ: 0, maxZ: 4 },
        height: 8,
        color: [0.1, 0.1, 0.1],
        seed: 1,
    };

    assert.equal(isLineBlockedByBuildings([-2, 1, 2], [6, 1, 2], [building]), true);
    assert.equal(isLineBlockedByBuildings([-2, 1, -2], [6, 1, -2], [building]), false);
});
