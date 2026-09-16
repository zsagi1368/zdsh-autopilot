const DEFAULT_TTL_MS = 10 * 60_000;
export class EscalationGrants {
    rng;
    now;
    ttlMs;
    grants = new Map();
    constructor(rng, now = () => Date.now(), ttlMs = DEFAULT_TTL_MS) {
        this.rng = rng;
        this.now = now;
        this.ttlMs = ttlMs;
    }
    issue(spec) {
        const grantId = `g_${this.now().toString(36)}_${this.rng.token()}`;
        this.grants.set(spec.callId, {
            ...spec,
            justification: spec.justification.slice(0, 200),
            grantId,
            issuedAt: this.now(),
            expiresAt: this.now() + this.ttlMs,
        });
        return grantId;
    }
    /** Exact-match answer for the official approval seam. Consume on success. */
    decide(callId, toolName) {
        this.sweep();
        const record = this.grants.get(callId);
        if (!record)
            return undefined;
        if (record.toolName !== toolName)
            return undefined; // wrong shape → fail closed to the human chain
        if (this.now() >= record.expiresAt) {
            this.grants.delete(callId);
            return undefined;
        }
        this.grants.delete(callId); // single consumption by construction
        return 'allowed-once';
    }
    /** Unconditional reclamation at settlement — consumed or not. */
    settle(callId) {
        this.grants.delete(callId);
    }
    get size() {
        return this.grants.size;
    }
    sweep() {
        const now = this.now();
        for (const [callId, record] of this.grants) {
            if (now >= record.expiresAt)
                this.grants.delete(callId);
        }
    }
}
