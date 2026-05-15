import type { MeshData } from "./geometry";
import type { Mat4, Vec3 } from "./math";

export interface Mesh {
    positionBuffer: WebGLBuffer;
    normalBuffer: WebGLBuffer;
    indexBuffer: WebGLBuffer;
    indexCount: number;
}

export interface SpriteTexture {
    texture: WebGLTexture;
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

interface EarthProgram {
    program: WebGLProgram;
    aPosition: number;
    aNormal: number;
    uProjection: WebGLUniformLocation;
    uView: WebGLUniformLocation;
    uModel: WebGLUniformLocation;
    uCameraPosition: WebGLUniformLocation;
    uFogColor: WebGLUniformLocation;
    uFogDensity: WebGLUniformLocation;
    uSunDirection: WebGLUniformLocation;
    uTime: WebGLUniformLocation;
}

interface SpriteProgram {
    program: WebGLProgram;
    aCorner: number;
    aUv: number;
    uProjection: WebGLUniformLocation;
    uView: WebGLUniformLocation;
    uCenter: WebGLUniformLocation;
    uCameraRight: WebGLUniformLocation;
    uCameraUp: WebGLUniformLocation;
    uSize: WebGLUniformLocation;
    uRotation: WebGLUniformLocation;
    uColor: WebGLUniformLocation;
    uTexture: WebGLUniformLocation;
    uOpaque: WebGLUniformLocation;
}

export class Renderer {
    private readonly gl: WebGLRenderingContext;
    private readonly meshProgram: MeshProgram;
    private readonly starProgram: StarProgram;
    private readonly earthProgram: EarthProgram;
    private readonly spriteProgram: SpriteProgram;
    private readonly spriteVertexBuffer: WebGLBuffer;
    private readonly spriteIndexBuffer: WebGLBuffer;
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
        this.earthProgram = this.createEarthProgram();
        this.spriteProgram = this.createSpriteProgram();
        this.spriteVertexBuffer = this.createArrayBuffer(
            new Float32Array([-0.5, -0.5, 0, 1, 0.5, -0.5, 1, 1, 0.5, 0.5, 1, 0, -0.5, 0.5, 0, 0]),
        );
        this.spriteIndexBuffer = this.createElementBuffer(new Uint16Array([0, 1, 2, 0, 2, 3]));
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    resize(): boolean {
        const displayWidth = Math.max(
            1,
            Math.floor(this.canvas.clientWidth * window.devicePixelRatio),
        );
        const displayHeight = Math.max(
            1,
            Math.floor(this.canvas.clientHeight * window.devicePixelRatio),
        );
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

    createTexture(url: string): SpriteTexture {
        const gl = this.gl;
        const texture = gl.createTexture();
        if (!texture) {
            throw new Error("Impossible de creer une texture WebGL.");
        }

        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            1,
            1,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array([255, 255, 255, 255]),
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        const image = new Image();
        image.addEventListener("load", () => {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        });
        image.src = url;

        return { texture };
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
            positions.push(
                Math.cos(theta) * xy * radius,
                z * radius,
                Math.sin(theta) * xy * radius,
            );
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

    setCamera(
        projection: Mat4,
        view: Mat4,
        position: Vec3,
        fogColor: Vec3,
        lightDirection: Vec3,
    ): void {
        this.projection = projection;
        this.view = view;
        this.cameraPosition = position;
        this.fogColor = fogColor;
        this.lightDirection = lightDirection;
    }

    drawMesh(
        mesh: Mesh,
        model: Mat4,
        color: [number, number, number, number],
        emissive = 0,
        fogDensity = 1,
    ): void {
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

    drawEarth(mesh: Mesh, model: Mat4, time: number, sunDirection: Vec3, fogDensity = 0.35): void {
        if (!this.projection || !this.view) {
            return;
        }

        const gl = this.gl;
        const p = this.earthProgram;
        gl.useProgram(p.program);
        gl.uniformMatrix4fv(p.uProjection, false, this.projection);
        gl.uniformMatrix4fv(p.uView, false, this.view);
        gl.uniformMatrix4fv(p.uModel, false, model);
        gl.uniform3fv(p.uCameraPosition, this.cameraPosition);
        gl.uniform3fv(p.uFogColor, this.fogColor);
        gl.uniform1f(p.uFogDensity, fogDensity);
        gl.uniform3fv(p.uSunDirection, sunDirection);
        gl.uniform1f(p.uTime, time);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.positionBuffer);
        gl.enableVertexAttribArray(p.aPosition);
        gl.vertexAttribPointer(p.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
        gl.enableVertexAttribArray(p.aNormal);
        gl.vertexAttribPointer(p.aNormal, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);
    }

    drawBillboard(
        texture: SpriteTexture,
        center: Vec3,
        size: [number, number],
        color: [number, number, number, number],
        rotation = 0,
        opaque = false,
    ): void {
        if (!this.projection || !this.view) {
            return;
        }

        const gl = this.gl;
        const p = this.spriteProgram;
        const cameraRight: Vec3 = [this.view[0], this.view[4], this.view[8]];
        const cameraUp: Vec3 = [this.view[1], this.view[5], this.view[9]];

        gl.useProgram(p.program);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.uniformMatrix4fv(p.uProjection, false, this.projection);
        gl.uniformMatrix4fv(p.uView, false, this.view);
        gl.uniform3fv(p.uCenter, center);
        gl.uniform3fv(p.uCameraRight, cameraRight);
        gl.uniform3fv(p.uCameraUp, cameraUp);
        gl.uniform2fv(p.uSize, size);
        gl.uniform1f(p.uRotation, rotation);
        gl.uniform4fv(p.uColor, color);
        gl.uniform1f(p.uOpaque, opaque ? 1 : 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture.texture);
        gl.uniform1i(p.uTexture, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteVertexBuffer);
        gl.enableVertexAttribArray(p.aCorner);
        gl.vertexAttribPointer(p.aCorner, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(p.aUv);
        gl.vertexAttribPointer(p.aUv, 2, gl.FLOAT, false, 16, 8);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.spriteIndexBuffer);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
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

    private createElementBuffer(data: Uint16Array): WebGLBuffer {
        const buffer = this.gl.createBuffer();
        if (!buffer) {
            throw new Error("Impossible de creer un element buffer WebGL.");
        }
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
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

    private createEarthProgram(): EarthProgram {
        const vertex = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      uniform mat4 uProjection;
      uniform mat4 uView;
      uniform mat4 uModel;
      varying vec3 vLocalNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec4 worldPosition = uModel * vec4(aPosition, 1.0);
        vLocalNormal = normalize(aNormal);
        vWorldNormal = normalize(mat3(uModel) * aNormal);
        vWorldPosition = worldPosition.xyz;
        gl_Position = uProjection * uView * worldPosition;
      }
    `;
        const fragment = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec3 uCameraPosition;
      uniform vec3 uFogColor;
      uniform vec3 uSunDirection;
      uniform float uFogDensity;
      uniform float uTime;
      varying vec3 vLocalNormal;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      const float PI = 3.14159265359;
      const float TAU = 6.28318530718;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.52;
        for (int i = 0; i < 5; i++) {
          value += noise(p) * amplitude;
          p = p * 2.03 + vec2(17.13, 9.71);
          amplitude *= 0.52;
        }
        return value;
      }

      float wrapDistance(float a, float b) {
        float d = abs(a - b);
        return min(d, 1.0 - d);
      }

      float continentBlob(vec2 uv, vec2 center, vec2 radius) {
        vec2 d = vec2(wrapDistance(uv.x, center.x) / radius.x, (uv.y - center.y) / radius.y);
        float shape = dot(d, d);
        return 1.0 - smoothstep(0.72, 1.0, shape);
      }

      float continentMask(vec2 uv) {
        float land = 0.0;
        land = max(land, continentBlob(uv, vec2(0.18, 0.64), vec2(0.16, 0.13)));
        land = max(land, continentBlob(uv, vec2(0.12, 0.56), vec2(0.09, 0.11)));
        land = max(land, continentBlob(uv, vec2(0.28, 0.39), vec2(0.07, 0.17)));
        land = max(land, continentBlob(uv, vec2(0.60, 0.62), vec2(0.22, 0.12)));
        land = max(land, continentBlob(uv, vec2(0.52, 0.46), vec2(0.09, 0.16)));
        land = max(land, continentBlob(uv, vec2(0.75, 0.34), vec2(0.08, 0.06)));
        land = max(land, 1.0 - smoothstep(0.08, 0.13, uv.y));
        float coastNoise = fbm(uv * vec2(18.0, 9.0)) - 0.48;
        return smoothstep(0.34, 0.54, land + coastNoise * 0.42);
      }

      void main() {
        vec3 localNormal = normalize(vLocalNormal);
        vec3 normal = normalize(vWorldNormal);
        vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
        vec3 sunDirection = normalize(uSunDirection);
        float sun = dot(normal, sunDirection);
        float day = smoothstep(-0.22, 0.18, sun);
        float latitude = abs(localNormal.y);
        float longitude = atan(localNormal.z, localNormal.x) / TAU + 0.5;
        float normalizedLatitude = asin(clamp(localNormal.y, -1.0, 1.0)) / PI + 0.5;
        vec2 uv = vec2(longitude, normalizedLatitude);

        float land = continentMask(uv);
        float relief = fbm(uv * vec2(34.0, 17.0) + vec2(2.0, 4.0));
        float coast = 1.0 - smoothstep(0.08, 0.18, abs(land - 0.5));
        vec3 deepOcean = vec3(0.015, 0.07, 0.18);
        vec3 shallowOcean = vec3(0.035, 0.29, 0.44);
        vec3 ocean = mix(deepOcean, shallowOcean, coast * 0.75 + relief * 0.16);
        vec3 forest = vec3(0.07, 0.28, 0.12);
        vec3 grass = vec3(0.22, 0.44, 0.14);
        vec3 desert = vec3(0.63, 0.48, 0.22);
        vec3 mountain = vec3(0.56, 0.49, 0.39);
        float arid = smoothstep(0.05, 0.56, fbm(uv * vec2(10.0, 7.0) + vec2(8.0, 1.0)));
        float mountainMask = smoothstep(0.64, 0.82, relief);
        vec3 landColor = mix(forest, grass, smoothstep(0.18, 0.55, relief));
        landColor = mix(landColor, desert, arid * (1.0 - latitude) * 0.72);
        landColor = mix(landColor, mountain, mountainMask);
        float ice = smoothstep(0.68, 0.88, latitude) + (1.0 - smoothstep(0.03, 0.10, normalizedLatitude));
        landColor = mix(landColor, vec3(0.86, 0.89, 0.82), clamp(ice, 0.0, 1.0));
        vec3 surface = mix(ocean, landColor, land);

        vec2 cloudUv = uv * vec2(8.0, 4.0) + vec2(uTime * 0.011, sin(uTime * 0.08) * 0.08);
        float cloudBase = fbm(cloudUv) * 0.72 + fbm(cloudUv * 2.1 + vec2(7.0, 3.0)) * 0.28;
        float stormBands = smoothstep(0.52, 0.72, sin((uv.y + fbm(uv * 5.0) * 0.12) * 34.0) * 0.5 + 0.5);
        float clouds = smoothstep(0.58, 0.75, cloudBase + stormBands * 0.16);
        vec3 cloudColor = vec3(0.92, 0.95, 0.92);

        float night = 1.0 - day;
        float cityNoise = fbm(uv * vec2(80.0, 35.0));
        float cityLights = land * night * smoothstep(0.69, 0.81, cityNoise) * (1.0 - ice);
        vec3 color = mix(surface, cloudColor, clouds * (0.28 + day * 0.55));
        float diffuse = 0.13 + day * (0.82 + max(sun, 0.0) * 0.25);
        color *= diffuse;
        color += vec3(1.0, 0.62, 0.22) * cityLights * 0.75;

        float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.25);
        float sunRim = smoothstep(-0.3, 0.55, sun);
        float terminator = 1.0 - smoothstep(0.0, 0.55, abs(sun));
        vec3 blueAtmosphere = vec3(0.22, 0.62, 1.0) * rim * (0.36 + sunRim * 1.2);
        vec3 sunsetAtmosphere = vec3(1.0, 0.34, 0.12) * rim * terminator * 0.58;
        color += blueAtmosphere + sunsetAtmosphere;

        float distanceFromCamera = length(uCameraPosition - vWorldPosition);
        float fog = smoothstep(28.0, 120.0, distanceFromCamera * uFogDensity);
        gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
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
            uCameraPosition: this.mustUniform(program, "uCameraPosition"),
            uFogColor: this.mustUniform(program, "uFogColor"),
            uFogDensity: this.mustUniform(program, "uFogDensity"),
            uSunDirection: this.mustUniform(program, "uSunDirection"),
            uTime: this.mustUniform(program, "uTime"),
        };
    }

    private createSpriteProgram(): SpriteProgram {
        const vertex = `
      attribute vec2 aCorner;
      attribute vec2 aUv;
      uniform mat4 uProjection;
      uniform mat4 uView;
      uniform vec3 uCenter;
      uniform vec3 uCameraRight;
      uniform vec3 uCameraUp;
      uniform vec2 uSize;
      uniform float uRotation;
      varying vec2 vUv;

      void main() {
        float c = cos(uRotation);
        float s = sin(uRotation);
        vec2 rotated = vec2(aCorner.x * c - aCorner.y * s, aCorner.x * s + aCorner.y * c);
        vec3 worldPosition = uCenter + uCameraRight * rotated.x * uSize.x + uCameraUp * rotated.y * uSize.y;
        vUv = aUv;
        gl_Position = uProjection * uView * vec4(worldPosition, 1.0);
      }
    `;
        const fragment = `
      precision mediump float;
      uniform sampler2D uTexture;
      uniform vec4 uColor;
      uniform float uOpaque;
      varying vec2 vUv;

      void main() {
        vec4 texel = texture2D(uTexture, vUv);
        float alphaCutoff = uOpaque > 0.5 ? 0.34 : 0.02;
        if (texel.a < alphaCutoff) {
          discard;
        }
        vec3 tinted = mix(texel.rgb, texel.rgb * uColor.rgb, 0.34);
        float alpha = uOpaque > 0.5 ? 1.0 : texel.a * uColor.a;
        gl_FragColor = vec4(tinted, alpha);
      }
    `;
        const program = this.linkProgram(vertex, fragment);
        return {
            program,
            aCorner: this.gl.getAttribLocation(program, "aCorner"),
            aUv: this.gl.getAttribLocation(program, "aUv"),
            uProjection: this.mustUniform(program, "uProjection"),
            uView: this.mustUniform(program, "uView"),
            uCenter: this.mustUniform(program, "uCenter"),
            uCameraRight: this.mustUniform(program, "uCameraRight"),
            uCameraUp: this.mustUniform(program, "uCameraUp"),
            uSize: this.mustUniform(program, "uSize"),
            uRotation: this.mustUniform(program, "uRotation"),
            uColor: this.mustUniform(program, "uColor"),
            uTexture: this.mustUniform(program, "uTexture"),
            uOpaque: this.mustUniform(program, "uOpaque"),
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
