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
  "KeyR",
]);

export class InputController {
  private readonly keys = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private shot = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (event) => {
      if (movementKeys.has(event.code)) {
        event.preventDefault();
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
      if (event.button !== 0) {
        return;
      }
      if (document.pointerLockElement === this.canvas || event.target === this.canvas) {
        this.shot = true;
      }
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestPointerLock(): void {
    this.canvas.requestPointerLock();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  consumeLook(): [number, number] {
    const delta: [number, number] = [this.lookX, this.lookY];
    this.lookX = 0;
    this.lookY = 0;
    return delta;
  }

  consumeShot(): boolean {
    const didShoot = this.shot;
    this.shot = false;
    return didShoot;
  }

  clearTransient(): void {
    this.lookX = 0;
    this.lookY = 0;
    this.shot = false;
  }
}
