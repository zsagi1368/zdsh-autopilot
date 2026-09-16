/**
 * Path hardening for Windows-first judgment.
 *
 * All predicates are pure and I/O-free. normalizePath never touches the disk:
 * casing folds, trailing dots/spaces strip, NT namespace prefixes collapse,
 * reserved device names and drive-relative ambiguity are detected explicitly.
 */
export interface PathRoots {
    workspaceRoot: string;
    homePath: string;
    /** DSH config home, e.g. ~/.dsh-zdsh */
    dshHomePath: string;
}
export interface NormalizedPath {
    raw: string;
    normalized: string;
    /** True when the path is absolute after normalization. */
    isAbsolute: boolean;
    driveRelativeAmbiguity: boolean;
    reservedDeviceName: boolean;
}
export declare function normalizePath(raw: string): NormalizedPath;
/**
 * Containment check. On win32, `path.relative` across drives returns an
 * ABSOLUTE path (no '..' prefix), which defeats naive startsWith('..')
 * checks — the isAbsolute guard below is therefore load-bearing, not style.
 */
export declare function isWithin(root: string, candidate: string): boolean;
export declare function isCriticalPath(roots: PathRoots, candidate: string): boolean;
export declare function isCredentialTree(candidate: string): boolean;
export declare function isProtectedProjectMeta(workspaceRoot: string, candidate: string): boolean;
