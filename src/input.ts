const movementKeys = new Set([
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ShiftLeft",
    "ShiftRight",
    "Space",
    "Backspace",
    "KeyR",
]);

export class InputController {
    private readonly keys = new Set<string>();
    private readonly keyPresses = new Set<string>();
    private readonly primaryReleases: number[] = [];
    private lookX = 0;
    private lookY = 0;
    private primaryStartedAt = 0;
    private primaryDown = false;
    private secondaryPresses = 0;

    constructor(private readonly canvas: HTMLCanvasElement) {
        window.addEventListener("keydown", (event) => {
            if (movementKeys.has(event.code)) {
                event.preventDefault();
            }
            if (!this.keys.has(event.code)) {
                this.keyPresses.add(event.code);
            }
            this.keys.add(event.code);
        });

        window.addEventListener("keyup", (event) => {
            this.keys.delete(event.code);
        });

        document.addEventListener("mousemove", (event) => {
            if (document.pointerLockElement !== this.canvas) {
                return;
            }
            this.lookX += event.movementX;
            this.lookY += event.movementY;
        });

        document.addEventListener("mousedown", (event) => {
            if (document.pointerLockElement !== this.canvas && event.target !== this.canvas) {
                return;
            }

            if (event.button === 0) {
                if (!this.primaryDown) {
                    this.primaryDown = true;
                    this.primaryStartedAt = performance.now();
                }
                return;
            }

            if (event.button === 2) {
                event.preventDefault();
                this.secondaryPresses += 1;
            }
        });

        document.addEventListener("mouseup", (event) => {
            if (event.button !== 0 || !this.primaryDown) {
                return;
            }
            this.primaryDown = false;
            this.primaryReleases.push((performance.now() - this.primaryStartedAt) / 1000);
        });

        document.addEventListener("contextmenu", (event) => {
            if (document.pointerLockElement === this.canvas || event.target === this.canvas) {
                event.preventDefault();
            }
        });

        document.addEventListener("pointerlockchange", () => {
            if (document.pointerLockElement !== this.canvas) {
                this.clearTransient();
            }
        });

        window.addEventListener("blur", () => this.clearTransient());
    }

    get locked(): boolean {
        return document.pointerLockElement === this.canvas;
    }

    get isPrimaryDown(): boolean {
        return this.primaryDown;
    }

    requestPointerLock(): void {
        this.canvas.requestPointerLock();
    }

    isDown(code: string): boolean {
        return this.keys.has(code);
    }

    consumeKeyPress(codes: readonly string[]): boolean {
        for (const code of codes) {
            if (this.keyPresses.has(code)) {
                this.keyPresses.delete(code);
                return true;
            }
        }
        return false;
    }

    consumeLook(): [number, number] {
        const delta: [number, number] = [this.lookX, this.lookY];
        this.lookX = 0;
        this.lookY = 0;
        return delta;
    }

    consumePrimaryRelease(): number | null {
        return this.primaryReleases.shift() ?? null;
    }

    consumeSecondaryPress(): boolean {
        if (this.secondaryPresses === 0) {
            return false;
        }
        this.secondaryPresses -= 1;
        return true;
    }

    primaryHoldSeconds(now: number): number {
        if (!this.primaryDown) {
            return 0;
        }
        return Math.max(0, (now - this.primaryStartedAt) / 1000);
    }

    clearTransient(): void {
        this.lookX = 0;
        this.lookY = 0;
        this.keyPresses.clear();
        this.primaryDown = false;
        this.primaryStartedAt = 0;
        this.primaryReleases.length = 0;
        this.secondaryPresses = 0;
    }
}
