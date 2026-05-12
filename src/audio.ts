export class AudioFX {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private rumble: OscillatorNode | null = null;
    private rumbleGain: GainNode | null = null;
    private alarmClock = 0;

    start(): void {
        if (this.context) {
            void this.context.resume();
            return;
        }

        const context = new AudioContext();
        const master = context.createGain();
        master.gain.value = 0.22;
        master.connect(context.destination);

        const rumble = context.createOscillator();
        rumble.type = "sawtooth";
        rumble.frequency.value = 47;

        const rumbleGain = context.createGain();
        rumbleGain.gain.value = 0.04;
        rumble.connect(rumbleGain);
        rumbleGain.connect(master);
        rumble.start();

        this.context = context;
        this.master = master;
        this.rumble = rumble;
        this.rumbleGain = rumbleGain;
    }

    update(time: number, stress: number, alarm: boolean): void {
        if (!this.context || !this.rumble || !this.rumbleGain) {
            return;
        }
        const now = this.context.currentTime;
        this.rumble.frequency.setTargetAtTime(
            38 + stress * 44 + Math.sin(time * 11) * 4,
            now,
            0.04,
        );
        this.rumbleGain.gain.setTargetAtTime(0.035 + stress * 0.09, now, 0.06);
        if (alarm && time > this.alarmClock) {
            this.alarmClock = time + 0.74;
            this.beep(330, 0.085, 0.18);
            this.beep(208, 0.12, 0.1);
        }
    }

    transmissionTick(): void {
        this.beep(760, 0.045, 0.1);
    }

    landingThump(): void {
        this.beep(86, 0.22, 0.46);
    }

    shoot(): void {
        this.beep(132, 0.055, 0.2);
        this.beep(840, 0.035, 0.1);
    }

    enemyHit(): void {
        this.beep(520, 0.035, 0.12);
    }

    enemyDown(): void {
        this.beep(92, 0.18, 0.34);
        this.beep(310, 0.08, 0.16);
    }

    playerHit(): void {
        this.beep(118, 0.08, 0.2);
    }

    private beep(frequency: number, duration: number, volume: number): void {
        if (!this.context || !this.master) {
            return;
        }
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, this.context.currentTime);
        gain.gain.linearRampToValueAtTime(volume, this.context.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
        oscillator.connect(gain);
        gain.connect(this.master);
        oscillator.start();
        oscillator.stop(this.context.currentTime + duration + 0.02);
    }
}
