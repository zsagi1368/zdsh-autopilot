/**
 * Three-level capability probing.
 *
 * Every assumption about a host seam is REGISTERED here with a description and
 * an optional probe. Before a seam is relied upon:
 *   level 1 — precheck (version / shape inspection, cheap, no side effects)
 *   level 2 — first-call probe (a real but harmless call through the seam)
 *   level 3 — degradation flag (fall back to the in-memory equivalent path)
 *
 * Probe results are cached; modules query instead of assuming. Each entry's
 * comment names its regression test.
 */
export class ProbeRegistry {
    assumptions = new Map();
    statuses = new Map();
    register(assumption) {
        this.assumptions.set(assumption.id, assumption);
        if (!this.statuses.has(assumption.id)) {
            this.statuses.set(assumption.id, { id: assumption.id, state: 'unprobed' });
        }
    }
    /**
     * Run the three-level flow for one assumption and cache the verdict.
     * Safe to call repeatedly; only the first run performs work.
     */
    probe(id) {
        const cached = this.statuses.get(id);
        if (cached && cached.state !== 'unprobed')
            return cached;
        const assumption = this.assumptions.get(id);
        if (!assumption) {
            const status = { id, state: 'unavailable', detail: 'unknown assumption' };
            this.statuses.set(id, status);
            return status;
        }
        if (assumption.precheck) {
            let precheck;
            try {
                precheck = assumption.precheck();
            }
            catch (error) {
                precheck = error instanceof Error ? error.message : String(error);
            }
            if (precheck !== true) {
                const status = {
                    id,
                    state: 'degraded',
                    detail: `precheck failed${typeof precheck === 'string' ? `: ${precheck}` : ''}`,
                };
                this.statuses.set(id, status);
                return status;
            }
        }
        if (!assumption.probe) {
            const status = { id, state: 'available' };
            this.statuses.set(id, status);
            return status;
        }
        let probeResult;
        try {
            probeResult = assumption.probe();
        }
        catch (error) {
            probeResult = error instanceof Error ? error.message : String(error);
        }
        const status = probeResult === true
            ? { id, state: 'available' }
            : { id, state: 'degraded', detail: probeResult };
        this.statuses.set(id, status);
        return status;
    }
    status(id) {
        return (this.statuses.get(id) ?? { id, state: 'unavailable', detail: 'not registered' });
    }
    all() {
        return [...this.statuses.values()];
    }
}
