export const CIRCUIT_DEFAULTS = {
    consecutiveDenials: 3,
    windowSize: 10,
    windowDenials: 6,
    action: 'delegate',
};
export class ReviewCircuit {
    config;
    rng;
    now;
    consecutive = 0;
    /** Denial outcomes within the sliding window (true = denial). */
    window = [];
    constructor(config = CIRCUIT_DEFAULTS, rng, now = () => Date.now()) {
        this.config = config;
        this.rng = rng;
        this.now = now;
    }
    record(decision, escalatedToDenial = false) {
        const isDenial = decision === 'deny' || escalatedToDenial;
        this.window.push(isDenial);
        while (this.window.length > this.config.windowSize)
            this.window.shift();
        if (isDenial) {
            this.consecutive += 1;
        }
        else {
            this.consecutive = 0;
        }
    }
    get state() {
        return {
            tripped: this.isTripped(),
            action: this.config.action,
        };
    }
    isTripped() {
        if (this.consecutive >= this.config.consecutiveDenials)
            return true;
        const denialsInWindow = this.window.filter(d => d).length;
        return denialsInWindow >= this.config.windowDenials && this.window.length >= Math.min(this.config.windowSize, this.config.windowDenials);
    }
    /** Reset after human intervention or an explicit cool-off. */
    reset() {
        this.consecutive = 0;
        this.window = [];
    }
    snapshotToken() {
        void this.rng;
        void this.now;
        return `${this.consecutive}:${this.window.map(d => (d ? '1' : '0')).join('')}`;
    }
}
