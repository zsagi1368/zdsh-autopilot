/**
 * Audit vocabulary, folds, markers, and the visibility invariant.
 *
 * "Model-visible ⟺ recorded": any text injected into a model conversation
 * carries a stable marker `[autopilot:<event>/<id>]`, and every event flagged
 * as model-visible must have that marker present in the recorded injections.
 * Both directions are mechanically checkable (see `checkVisibility`).
 */
import { AUDIT_EVENTS } from './types.js';
export const AUDIT_EVENT_NAMES = AUDIT_EVENTS;
export function envelope(name, data) {
    return { type: name, data, options: { ignorable: true } };
}
export function makeEventId(prefix, rng, at) {
    return `${prefix}_${at.toString(36)}_${rng.token()}`;
}
export function makeAuditEvent(name, data, at, rng) {
    return { name, id: makeEventId(name.replace('/', '_'), rng, at), at, data };
}
// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------
const MARKER_RE = /\[autopilot:(ap\/[a-z]+)\/([A-Za-z0-9_-]+)\]/g;
export function buildMarker(name, id) {
    return `[autopilot:${name}/${id}]`;
}
export function parseMarkers(text) {
    const out = [];
    for (const match of text.matchAll(MARKER_RE)) {
        const event = match[1];
        if (!AUDIT_EVENT_NAMES.includes(event))
            continue;
        out.push({ event, id: match[2] ?? '' });
    }
    return out;
}
const VERDICT_CAP = 50;
export function initialAuditState() {
    const counters = {};
    for (const name of AUDIT_EVENT_NAMES)
        counters[name] = 0;
    return {
        enabled: true,
        counters,
        grants: {},
        overrides: {},
        circuit: { tripped: false, action: undefined },
        lastVerdicts: [],
    };
}
export function foldAudit(state, event) {
    const next = {
        ...state,
        counters: { ...state.counters, [event.name]: state.counters[event.name] + 1 },
        grants: { ...state.grants },
        overrides: { ...state.overrides },
        lastVerdicts: [...state.lastVerdicts],
    };
    switch (event.name) {
        case 'ap/state':
            next.enabled = event.data.enabled;
            break;
        case 'ap/grant':
            next.grants[event.data.grantId] = { phase: event.data.phase };
            break;
        case 'ap/override':
            next.overrides[event.data.overrideId] = {
                toolName: event.data.toolName,
                phase: event.data.phase,
            };
            break;
        case 'ap/circuit':
            // Each ap/circuit event records one trip; resets are expressed by a
            // follow-up state event rather than a synthetic reset here.
            next.circuit = {
                tripped: true,
                action: event.data.action,
            };
            break;
        case 'ap/verdict': {
            const record = {
                verdictId: event.data.verdictId,
                decision: event.data.decision,
            };
            if (event.data.fallback !== undefined)
                record.fallback = event.data.fallback;
            next.lastVerdicts.push(record);
            if (next.lastVerdicts.length > VERDICT_CAP)
                next.lastVerdicts.shift();
            break;
        }
        case 'ap/resumed':
        case 'ap/skipped':
        case 'ap/loop':
        case 'ap/decision':
            break;
        default:
            break;
    }
    return next;
}
/**
 * Two-directional check between injected texts and the audit stream. Only
 * events whose payload produced model-visible text participate; payloads mark
 * this via an accompanying `visible` list supplied by the caller.
 */
export function checkVisibility(injectedTexts, events, visibleEventIds) {
    const recordedIds = new Set(events.map(e => e.id));
    const markersWithoutEvents = [];
    for (const text of injectedTexts) {
        for (const marker of parseMarkers(text)) {
            const key = `${marker.event}#${marker.id}`;
            if (!recordedIds.has(marker.id) && !visibleEventIds.has(key)) {
                // Unknown marker format or missing event — both directions report.
                markersWithoutEvents.push(marker);
            }
        }
    }
    const allText = injectedTexts.join('\n');
    const eventsWithoutMarkers = [];
    for (const event of events) {
        if (!visibleEventIds.has(`${event.name}#${event.id}`))
            continue;
        if (!allText.includes(buildMarker(event.name, event.id))) {
            eventsWithoutMarkers.push(event.name);
        }
    }
    return { markersWithoutEvents, eventsWithoutMarkers };
}
