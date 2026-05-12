import type { Mat4, Vec3 } from "./math.js";
import type { MeshData } from "./geometry.js";

export interface Mesh {
  positionBuffer: WebGLBuffer;
  normalBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  indexCount: number;
}

interface StarField {
  positionBuffer: WebGLBuffer;
  sizeBuffer: WebGLBuffer;
  count: number;
}

interface MeshProgram {
  program: WebGLProgram;
  aPosition: number;
  aNormal: number;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uModel: WebGLUniformLocation;
  uColor: WebGLUniformLocation;
  uCameraPosition: WebGLUniformLocation;
  uLightDirection: WebGLUniformLocation;
  uFogColor: WebGLUniformLocation;
  uFogDensity: WebGLUniformLocation;
  uEmissive: WebGLUniformLocation;
}

interface StarProgram {
  program: WebGLProgram;
  aPosition: number;
  aSize: number;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uTime: WebGLUniformLocation;
}

export class Renderer {
  private readonly gl: WebGLRenderingContext;
  private readonly meshProgram: MeshProgram;
  private readonly starProgram: StarProgram;
  private projection: Mat4 | null = null;
  private view: Mat4 | null = null;
  private cameraPosition: Vec3 = [0, 0, 0];
  private fogColor: Vec3 = [0.03, 0.035, 0.055];
  private lightDirection: Vec3 = [-0.6, -0.45, -0.7];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: true,
      powerPreference: "high-performance",
    });
    if (!gl) {
      throw new Error("WebGL indisponible dans ce navigateur.");
    }
    this.gl = gl;
    this.meshProgram = this.createMeshProgram();
    this.starProgram = this.createStarProgram();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(): boolean {
    const displayWidth = Math.max(1, Math.floor(this.canvas.clientWidth * window.devicePixelRatio));
    const displayHeight = Math.max(1, Math.floor(this.canvas.clientHeight * window.devicePixelRatio));
    if (this.canvas.width === displayWidth && this.canvas.height === displayHeight) {
      return false;
    }
    this.canvas.width = displayWidth;
    this.canvas.height = displayHeight;
    this.gl.viewport(0, 0, displayWidth, displayHeight);
    return true;
  }

  get aspect(): number {
    return this.canvas.width / Math.max(1, this.canvas.height);
  }

  createMesh(data: MeshData): Mesh {
    const gl = this.gl;
    const positionBuffer = this.createArrayBuffer(new Float32Array(data.positions));
    const normalBuffer = this.createArrayBuffer(new Float32Array(data.normals));
    const indexBuffer = gl.createBuffer();
    if (!indexBuffer) {
      throw new Error("Impossible de creer un index buffer WebGL.");
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices), gl.STATIC_DRAW);
    return { positionBuffer, normalBuffer, indexBuffer, indexCount: data.indices.length };
  }

  createStarField(seed = 73, count = 680): StarField {
    const positions: number[] = [];
    const sizes: number[] = [];
    let random = seed;
    const next = () => {
      random = (random * 1664525 + 1013904223) >>> 0;
      return random / 0xffffffff;
    };

    for (let i = 0; i < count; i += 1) {
      const radius = 64 + next() * 150;
      const theta = next() * Math.PI * 2;
      const z = next() * 2 - 1;
      const xy = Math.sqrt(1 - z * z);
      positions.push(Math.cos(theta) * xy * radius, z * radius, Math.sin(theta) * xy * radius);
      sizes.push(1.2 + next() * 2.9);
    }

    return {
      positionBuffer: this.createArrayBuffer(new Float32Array(positions)),
      sizeBuffer: this.createArrayBuffer(new Float32Array(sizes)),
      count,
    };
  }

  beginFrame(clearColor: Vec3): void {
    const gl = this.gl;
    gl.clearColor(clearColor[0], clearColor[1], clearColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  setCamera(projection: Mat4, view: Mat4, position: Vec3, fogColor: Vec3, lightDirection: Vec3): void {
    this.projection = projection;
    this.view = view;
    this.cameraPosition = position;
    this.fogColor = fogColor;
    this.lightDirection = lightDirection;
  }

  drawMesh(mesh: Mesh, model: Mat4, color: [number, number, number, number], emissive = 0, fogDensity = 1): void {
    if (!this.projection || !this.view) {
      return;
    }
    const gl = this.gl;
    const p = this.meshProgram;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.uProjection, false, this.projection);
    gl.uniformMatrix4fv(p.uView, false, this.view);
    gl.uniformMatrix4fv(p.uModel, false, model);
    gl.uniform4fv(p.uColor, color);
    gl.uniform3fv(p.uCameraPosition, this.cameraPosition);
    gl.uniform3fv(p.uLightDirection, this.lightDirection);
    gl.uniform3fv(p.uFogColor, this.fogColor);
    gl.uniform1f(p.uFogDensity, fogDensity);
    gl.uniform1f(p.uEmissive, emissive);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
    gl.enableVertexAttribArray(p.aPosition);
    gl.vertexAttribPointer(p.aPosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
    gl.enableVertexAttribArray(p.aNormal);
    gl.vertexAttribPointer(p.aNormal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
  }

  drawStars(stars: StarField, time: number): void {
    if (!this.projection || !this.view) {
      return;
    }
    const gl = this.gl;
    const p = this.starProgram;
    gl.useProgram(p.program);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(p.uProjection, false, this.projection);
    gl.uniformMatrix4fv(p.uView, false, this.view);
    gl.uniform1f(p.uTime, time);

    gl.bindBuffer(gl.ARRAY_BUFFER, stars.positionBuffer);
    gl.enableVertexAttribArray(p.aPosition);
    gl.vertexAttribPointer(p.aPosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, stars.sizeBuffer);
    gl.enableVertexAttribArray(p.aSize);
    gl.vertexAttribPointer(p.aSize, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, stars.count);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
  }

  private createArrayBuffer(data: Float32Array): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (!buffer) {
      throw new Error("Impossible de creer un buffer WebGL.");
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
    return buffer;
  }

  private createMeshProgram(): MeshProgram {
    const vertex = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      uniform mat4 uProjection;
      uniform mat4 uView;
      uniform mat4 uModel;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = uModel * vec4(aPosition, 1.0);
        vWorldPosition = worldPosition.xyz;
        vNormal = mat3(uModel) * aNormal;
        gl_Position = uProjection * uView * worldPosition;
      }
    `;
    const fragment = `
      precision mediump float;
      uniform vec4 uColor;
      uniform vec3 uCameraPosition;
      uniform vec3 uLightDirection;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uEmissive;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        float diffuse = max(dot(normal, normalize(-uLightDirection)), 0.0);
        float banded = floor(diffuse * 4.0) / 4.0;
        float light = 0.24 + banded * 0.92;
        vec3 color = uColor.rgb * light + uColor.rgb * uEmissive;
        float distanceFromCamera = length(uCameraPosition - vWorldPosition);
        float fog = smoothstep(22.0, 86.0, distanceFromCamera * uFogDensity);
        gl_FragColor = vec4(mix(color, uFogColor, fog), uColor.a);
      }
    `;
    const program = this.linkProgram(vertex, fragment);
    return {
      program,
      aPosition: this.gl.getAttribLocation(program, "aPosition"),
      aNormal: this.gl.getAttribLocation(program, "aNormal"),
      uProjection: this.mustUniform(program, "uProjection"),
      uView: this.mustUniform(program, "uView"),
      uModel: this.mustUniform(program, "uModel"),
      uColor: this.mustUniform(program, "uColor"),
      uCameraPosition: this.mustUniform(program, "uCameraPosition"),
      uLightDirection: this.mustUniform(program, "uLightDirection"),
      uFogColor: this.mustUniform(program, "uFogColor"),
      uFogDensity: this.mustUniform(program, "uFogDensity"),
      uEmissive: this.mustUniform(program, "uEmissive"),
    };
  }

  private createStarProgram(): StarProgram {
    const vertex = `
      attribute vec3 aPosition;
      attribute float aSize;
      uniform mat4 uProjection;
      uniform mat4 uView;
      uniform float uTime;
      varying float vAlpha;

      void main() {
        vec4 viewPosition = uView * vec4(aPosition, 1.0);
        gl_Position = uProjection * viewPosition;
        gl_PointSize = aSize * (70.0 / max(10.0, -viewPosition.z));
        vAlpha = 0.45 + 0.55 * abs(sin(uTime * 1.8 + aPosition.x * 0.13 + aPosition.y * 0.07));
      }
    `;
    const fragment = `
      precision mediump float;
      varying float vAlpha;

      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float distanceFromCenter = length(coord);
        if (distanceFromCenter > 0.5) {
          discard;
        }
        gl_FragColor = vec4(0.95, 0.97, 1.0, vAlpha);
      }
    `;
    const program = this.linkProgram(vertex, fragment);
    return {
      program,
      aPosition: this.gl.getAttribLocation(program, "aPosition"),
      aSize: this.gl.getAttribLocation(program, "aSize"),
      uProjection: this.mustUniform(program, "uProjection"),
      uView: this.mustUniform(program, "uView"),
      uTime: this.mustUniform(program, "uTime"),
    };
  }

  private linkProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const gl = this.gl;
    const vertex = this.compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragment = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) {
      throw new Error("Impossible de creer un programme WebGL.");
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Echec du link WebGL.");
    }
    return program;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error("Impossible de creer un shader WebGL.");
    }
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) ?? "Echec de compilation shader.");
    }
    return shader;
  }

  private mustUniform(program: WebGLProgram, name: string): WebGLUniformLocation {
    const location = this.gl.getUniformLocation(program, name);
    if (!location) {
      throw new Error(`Uniform WebGL introuvable: ${name}`);
    }
    return location;
  }
}
