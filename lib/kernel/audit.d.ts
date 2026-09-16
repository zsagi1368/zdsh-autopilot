import type { AuditEvent, AuditEventFor, AuditEventName, AuditPayloadMap } from './types.js';
import type { RandomSource } from './ledger.js';
export declare const AUDIT_EVENT_NAMES: readonly AuditEventName[];
/** Session-log append shape with the ignorable option the host supports. */
export interface IgnorableEnvelope<N extends AuditEventName = AuditEventName> {
    type: N;
    data: AuditPayloadMap[N];
    options: {
        ignorable: true;
    };
}
export declare function envelope<N extends AuditEventName>(name: N, data: AuditPayloadMap[N]): IgnorableEnvelope<N>;
export declare function makeEventId(prefix: string, rng: RandomSource, at: number): string;
export declare function makeAuditEvent<N extends AuditEventName>(name: N, data: AuditPayloadMap[N], at: number, rng: RandomSource): AuditEventFor<N>;
export declare function buildMarker(name: AuditEventName, id: string): string;
export interface ParsedMarker {
    event: AuditEventName;
    id: string;
}
export declare function parseMarkers(text: string): ParsedMarker[];
export interface CircuitStateFold {
    tripped: boolean;
    action: 'delegate' | 'reject' | 'abort-turn' | undefined;
}
export interface GrantStateFold {
    phase: 'issued' | 'consumed' | 'settled' | 'expired';
}
export interface OverrideStateFold {
    toolName: string;
    phase: 'issued' | 'consumed' | 'expired';
}
export interface VerdictRecord {
    verdictId: string;
    decision: 'allow' | 'deny';
    fallback?: string;
}
export interface AuditStateFold {
    enabled: boolean;
    counters: Record<AuditEventName, number>;
    grants: Record<string, GrantStateFold>;
    overrides: Record<string, OverrideStateFold>;
    circuit: CircuitStateFold;
    lastVerdicts: VerdictRecord[];
}
export declare function initialAuditState(): AuditStateFold;
export declare function foldAudit(state: AuditStateFold, event: AuditEvent): AuditStateFold;
export interface VisibilityReport {
    /** Markers present in injected text but no matching visible event was logged. */
    markersWithoutEvents: ParsedMarker[];
    /** Visible events were logged but their marker never appeared in any text. */
    eventsWithoutMarkers: AuditEventName[];
}
/**
 * Two-directional check between injected texts and the audit stream. Only
 * events whose payload produced model-visible text participate; payloads mark
 * this via an accompanying `visible` list supplied by the caller.
 */
export declare function checkVisibility(injectedTexts: readonly string[], events: readonly AuditEvent[], visibleEventIds: ReadonlySet<string>): VisibilityReport;
