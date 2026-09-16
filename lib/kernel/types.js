/**
 * Shared vocabulary for the AutoPilot kernel.
 *
 * The kernel is host-agnostic pure TypeScript: everything host-specific enters
 * through ports and everything module-specific stays behind the facade.
 */
// ---------------------------------------------------------------------------
// Audit vocabulary (`ap/*`). Nine families, all appended ignorable.
// ---------------------------------------------------------------------------
export const AUDIT_EVENTS = [
    'ap/state',
    'ap/resumed',
    'ap/skipped',
    'ap/loop',
    'ap/decision',
    'ap/grant',
    'ap/verdict',
    'ap/circuit',
    'ap/override',
];
/**
 * Events whose payload produces model-visible injected text. The invariant
 * "model-visible ⟺ recorded" is checked against exactly these.
 */
export const VISIBLE_AUDIT_EVENTS = [
    'ap/resumed',
    'ap/decision',
    'ap/circuit',
    'ap/verdict',
];
