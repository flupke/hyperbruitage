export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

export const normalize = (v: Vec3): Vec3 => {
  const len = length(v);
  return len > 0.00001 ? scale(v, 1 / len) : [0, 0, 0];
};

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export const identity = (): Mat4 => new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
]);

export const multiply = (a: Mat4, b: Mat4): Mat4 => {
  const out = new Float32Array(16);
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

  let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  return out;
};

export const perspective = (fovyRadians: number, aspect: number, near: number, far: number): Mat4 => {
  const f = 1 / Math.tan(fovyRadians / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
};

export const lookAt = (eye: Vec3, center: Vec3, up: Vec3): Mat4 => {
  const z = normalize(sub(eye, center));
  const x = normalize(cross(up, z));
  const y = cross(z, x);

  const out = identity();
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0];
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1];
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2];
  out[12] = -dot(x, eye);
  out[13] = -dot(y, eye);
  out[14] = -dot(z, eye);
  return out;
};

export const translation = (v: Vec3): Mat4 => {
  const out = identity();
  out[12] = v[0];
  out[13] = v[1];
  out[14] = v[2];
  return out;
};

export const scaling = (v: Vec3): Mat4 => {
  const out = identity();
  out[0] = v[0];
  out[5] = v[1];
  out[10] = v[2];
  return out;
};

export const rotationX = (radians: number): Mat4 => {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const out = identity();
  out[5] = c;
  out[6] = s;
  out[9] = -s;
  out[10] = c;
  return out;
};

export const rotationY = (radians: number): Mat4 => {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const out = identity();
  out[0] = c;
  out[2] = -s;
  out[8] = s;
  out[10] = c;
  return out;
};

export const rotationZ = (radians: number): Mat4 => {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const out = identity();
  out[0] = c;
  out[1] = s;
  out[4] = -s;
  out[5] = c;
  return out;
};

export const fromTRS = (position: Vec3, rotation: Vec3 = [0, 0, 0], size: Vec3 = [1, 1, 1]): Mat4 => {
  const translate = translation(position);
  const rotate = multiply(multiply(rotationZ(rotation[2]), rotationY(rotation[1])), rotationX(rotation[0]));
  return multiply(multiply(translate, rotate), scaling(size));
};
