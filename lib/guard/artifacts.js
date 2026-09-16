/**
 * Session artifact registry: "things THIS session created", identified by
 * file identity (dev/ino/birthtime/kind), never by path string.
 *
 * Identity is the authorization carrier: rename the path, replace it with a
 * symlink, or recreate the file, and its automatic-cleanup eligibility is
 * gone. Recursive cleanup requires EVERY existing object in the tree to be
 * registered — one untracked member disqualifies the whole tree.
 */
const MAX_TREE_OBJECTS = 4096;
function identityOf(stat) {
    return {
        dev: stat.dev,
        ino: stat.ino,
        birthtimeMs: stat.birthtimeMs,
        isDirectory: stat.isDirectory,
    };
}
function sameIdentity(a, b) {
    return (a.dev === b.dev && a.ino === b.ino &&
        Math.abs(a.birthtimeMs - b.birthtimeMs) < 2 &&
        a.isDirectory === b.isDirectory);
}
export class SessionArtifacts {
    fs;
    workspaceRoot;
    snapshotLimit;
    registered = new Map();
    planned = new Set();
    constructor(fs, workspaceRoot, snapshotLimit) {
        this.fs = fs;
        this.workspaceRoot = workspaceRoot;
        this.snapshotLimit = snapshotLimit;
    }
    /** Relative targets are anchored to the workspace root; absolute pass through. */
    resolve(p) {
        return /^[A-Za-z]:[\\/]|^\//.test(p) ? this.fs.join(p) : this.fs.join(this.workspaceRoot, p);
    }
    // -- Editor-planned creates (two-phase) ----------------------------------
    planCreate(path) {
        this.planned.add(this.resolve(path));
    }
    /** Settle succeeds only when the plan exists, nothing pre-existed, and the call succeeded. */
    settleCreate(path, existedBefore, callOk) {
        const key = this.resolve(path);
        if (!callOk || existedBefore || !this.planned.has(key))
            return false;
        this.planned.delete(key); // consume the plan only on successful settlement
        const stat = this.fs.lstat(key);
        if (!stat)
            return false;
        this.registered.set(key.toLowerCase(), identityOf(stat));
        return true;
    }
    // -- Shell snapshot diffing ------------------------------------------------
    /**
     * Bounded workspace walk. Returns undefined when the tree exceeds the limit
     * (prefer NOT tracking over mis-attributing old files).
     */
    snapshot() {
        const out = new Map();
        const queue = [this.workspaceRoot];
        while (queue.length > 0) {
            const dir = queue.shift();
            const entries = this.fs.listDir(dir);
            if (entries === undefined)
                continue;
            for (const name of entries) {
                if (out.size >= this.snapshotLimit)
                    return undefined;
                const full = this.fs.join(dir, name);
                const stat = this.fs.lstat(full);
                if (!stat)
                    continue;
                out.set(full.toLowerCase(), identityOf(stat));
                if (stat.isDirectory)
                    queue.push(full);
            }
        }
        return out;
    }
    /**
     * New paths AND new identities only — an old inode moved into a fresh
     * directory must not pass itself off as session-created.
     */
    diffSnapshots(before, after, snapshotTakenAt) {
        const created = [];
        for (const [key, identity] of after) {
            if (before.has(key))
                continue;
            if (identity.birthtimeMs < snapshotTakenAt - 2)
                continue; // pre-existing birth
            created.push(key);
        }
        return created;
    }
    registerFromDiff(paths) {
        let promoted = 0;
        for (const key of paths) {
            const stat = this.fs.lstat(key);
            if (!stat)
                continue;
            this.registered.set(key.toLowerCase(), identityOf(stat));
            promoted += 1;
        }
        return promoted;
    }
    /** Shell-created artifacts promote only on clean exits. */
    settleShell(ok) {
        void ok; // promotion already happened via registerFromDiff gating upstream
    }
    // -- Queries ---------------------------------------------------------------
    has(path) {
        const key = this.resolve(path).toLowerCase();
        const recorded = this.registered.get(key);
        if (!recorded)
            return false;
        const stat = this.fs.lstat(key);
        if (!stat || !sameIdentity(recorded, identityOf(stat)))
            return false; // identity stolen
        return true;
    }
    hasTree(dirPath) {
        const root = this.resolve(dirPath);
        // The anchor itself must be a REGISTERED DIRECTORY — otherwise an
        // untracked (or non-directory) path would pass vacuously because it has
        // "no strangers" underneath.
        const anchorStat = this.fs.lstat(root);
        if (!anchorStat || !anchorStat.isDirectory)
            return false;
        if (!this.has(root))
            return false;
        let seen = 1;
        const queue = [root];
        while (queue.length > 0) {
            const dir = queue.shift();
            const entries = this.fs.listDir(dir);
            if (entries === undefined)
                return false;
            for (const name of entries) {
                seen += 1;
                if (seen > MAX_TREE_OBJECTS)
                    return false;
                const full = this.fs.join(dir, name);
                if (!this.has(full))
                    return false; // one stranger poisons the tree
                const stat = this.fs.lstat(full);
                if (stat?.isDirectory)
                    queue.push(full);
            }
        }
        return true;
    }
    get size() {
        return this.registered.size;
    }
}
