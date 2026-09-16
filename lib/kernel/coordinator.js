export class AutomationCoordinator {
    handlers = new Map();
    pendingBySession = new Map();
    claimedCalls = new Set();
    /** Internal mutable twin of the readonly view handed to modules. */
    view = {
        paused: false,
        circuitOpen: false,
        hasPendingApproval: sessionId => (this.pendingBySession.get(sessionId)?.size ?? 0) > 0,
        claimCall: (callId) => {
            if (this.claimedCalls.has(callId))
                return false;
            this.claimedCalls.add(callId);
            return true;
        },
    };
    registerModule(moduleId, handler) {
        this.handlers.set(moduleId, { handler, enabled: true });
    }
    setModuleEnabled(moduleId, enabled) {
        const entry = this.handlers.get(moduleId);
        if (entry)
            entry.enabled = enabled;
    }
    setPaused(paused) {
        this.view.paused = paused;
    }
    setCircuitOpen(open) {
        this.view.circuitOpen = open;
    }
    get paused() {
        return this.view.paused;
    }
    get circuitOpen() {
        return this.view.circuitOpen;
    }
    dispatch(event) {
        // State maintenance first.
        switch (event.kind) {
            case 'approval-pending': {
                let set = this.pendingBySession.get(event.sessionId);
                if (!set) {
                    set = new Set();
                    this.pendingBySession.set(event.sessionId, set);
                }
                set.add(event.callId);
                break;
            }
            case 'approval-resolved': {
                const set = this.pendingBySession.get(event.sessionId);
                set?.delete(event.callId);
                break;
            }
            case 'pause-change':
                this.setPaused(event.paused);
                break;
            case 'circuit-change':
                this.setCircuitOpen(event.open);
                break;
            default:
                break;
        }
        // Gate resume requests centrally.
        if (event.kind === 'resume-request') {
            if (this.view.paused)
                return [{ status: 'suppressed', reason: 'paused' }];
            if ((this.pendingBySession.get(event.sessionId)?.size ?? 0) > 0) {
                return [{ status: 'deferred', reason: 'pending-approval' }];
            }
            if (this.view.circuitOpen) {
                return [{ status: 'suppressed', reason: 'circuit-open' }];
            }
        }
        // Fan out to every enabled module.
        const outcomes = [];
        for (const entry of this.handlers.values()) {
            if (!entry.enabled)
                continue;
            try {
                entry.handler(event, this.view);
                outcomes.push({ status: 'dispatched' });
            }
            catch {
                // Handler failures must not break the fanout for other modules;
                // module-internal failure mapping owns the audit trail.
                outcomes.push({ status: 'suppressed', reason: 'unavailable' });
            }
        }
        if (outcomes.length === 0 && event.kind === 'resume-request') {
            return [{ status: 'dispatched' }];
        }
        return outcomes.length > 0 ? outcomes : [{ status: 'dispatched' }];
    }
}
