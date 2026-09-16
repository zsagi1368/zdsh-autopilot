/**
 * Session artifact registry: "things THIS session created", identified by
 * file identity (dev/ino/birthtime/kind), never by path string.
 *
 * Identity is the authorization carrier: rename the path, replace it with a
 * symlink, or recreate the file, and its automatic-cleanup eligibility is
 * gone. Recursive cleanup requires EVERY existing object in the tree to be
 * registered — one untracked member disqualifies the whole tree.
 */
export interface ArtifactIdentity {
    dev: number;
    ino: number;
    birthtimeMs: number;
    isDirectory: boolean;
}
export interface LstatLike {
    dev: number;
    ino: number;
    birthtimeMs: number;
    isDirectory: boolean;
}
export interface FsProbePort {
    lstat(path: string): LstatLike | undefined;
    /** Directory entry names; undefined when unreadable. */
    listDir(path: string): string[] | undefined;
    join(...parts: string[]): string;
}
export declare class SessionArtifacts {
    private readonly fs;
    private readonly workspaceRoot;
    private readonly snapshotLimit;
    private readonly registered;
    private planned;
    constructor(fs: FsProbePort, workspaceRoot: string, snapshotLimit: number);
    /** Relative targets are anchored to the workspace root; absolute pass through. */
    private resolve;
    planCreate(path: string): void;
    /** Settle succeeds only when the plan exists, nothing pre-existed, and the call succeeded. */
    settleCreate(path: string, existedBefore: boolean, callOk: boolean): boolean;
    /**
     * Bounded workspace walk. Returns undefined when the tree exceeds the limit
     * (prefer NOT tracking over mis-attributing old files).
     */
    snapshot(): Map<string, ArtifactIdentity> | undefined;
    /**
     * New paths AND new identities only — an old inode moved into a fresh
     * directory must not pass itself off as session-created.
     */
    diffSnapshots(before: Map<string, ArtifactIdentity>, after: Map<string, ArtifactIdentity>, snapshotTakenAt: number): string[];
    registerFromDiff(paths: Iterable<string>): number;
    /** Shell-created artifacts promote only on clean exits. */
    settleShell(ok: boolean): void;
    has(path: string): boolean;
    hasTree(dirPath: string): boolean;
    get size(): number;
}
