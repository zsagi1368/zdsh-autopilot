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
export interface ProbeResult {
    ok: boolean;
    degraded: boolean;
    detail?: string;
}
export interface Assumption {
    id: string;
    /** What we assume about the host, phrased as a falsifiable statement. */
    description: string;
    /** Level-1 precheck; when absent the probe runs directly. */
    precheck?: () => boolean | string;
    /** Level-2 first-call probe; returns detail on failure. */
    probe?: () => true | string;
}
export interface AssumptionStatus {
    id: string;
    state: 'unprobed' | 'available' | 'degraded' | 'unavailable';
    detail?: string;
}
export declare class ProbeRegistry {
    private assumptions;
    private statuses;
    register(assumption: Assumption): void;
    /**
     * Run the three-level flow for one assumption and cache the verdict.
     * Safe to call repeatedly; only the first run performs work.
     */
    probe(id: string): AssumptionStatus;
    status(id: string): AssumptionStatus;
    all(): AssumptionStatus[];
}
