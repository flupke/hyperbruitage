export interface MeshData {
    positions: number[];
    normals: number[];
    indices: number[];
}

export const createBox = (): MeshData => {
    const positions = [
        -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5,
        -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5,
        0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5,
        0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5,
        -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
    ];
    const normals = [
        0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1,
        0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
        0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ];
    const indices = [
        0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18,
        16, 18, 19, 20, 21, 22, 20, 22, 23,
    ];
    return { positions, normals, indices };
};

export const createPlane = (): MeshData => ({
    positions: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    indices: [0, 2, 1, 0, 3, 2],
});

export const createPyramid = (): MeshData => {
    const positions = [
        -0.5, -0.35, 0.5, 0.5, -0.35, 0.5, 0, 0.5, 0, 0.5, -0.35, 0.5, 0.5, -0.35, -0.5, 0, 0.5, 0,
        0.5, -0.35, -0.5, -0.5, -0.35, -0.5, 0, 0.5, 0, -0.5, -0.35, -0.5, -0.5, -0.35, 0.5, 0, 0.5,
        0, -0.5, -0.35, -0.5, 0.5, -0.35, -0.5, 0.5, -0.35, 0.5, -0.5, -0.35, 0.5,
    ];
    const normals = [
        0, 0.52, 0.85, 0, 0.52, 0.85, 0, 0.52, 0.85, 0.85, 0.52, 0, 0.85, 0.52, 0, 0.85, 0.52, 0, 0,
        0.52, -0.85, 0, 0.52, -0.85, 0, 0.52, -0.85, -0.85, 0.52, 0, -0.85, 0.52, 0, -0.85, 0.52, 0,
        0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    ];
    const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 12, 14, 15];
    return { positions, normals, indices };
};

export const createSphere = (segments = 14, rings = 8): MeshData => {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    for (let y = 0; y <= rings; y += 1) {
        const v = y / rings;
        const theta = v * Math.PI;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let x = 0; x <= segments; x += 1) {
            const u = x / segments;
            const phi = u * Math.PI * 2;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            const nx = cosPhi * sinTheta;
            const ny = cosTheta;
            const nz = sinPhi * sinTheta;
            positions.push(nx * 0.5, ny * 0.5, nz * 0.5);
            normals.push(nx, ny, nz);
        }
    }

    for (let y = 0; y < rings; y += 1) {
        for (let x = 0; x < segments; x += 1) {
            const first = y * (segments + 1) + x;
            const second = first + segments + 1;
            indices.push(first, second, first + 1, second, second + 1, first + 1);
        }
    }

    return { positions, normals, indices };
};
