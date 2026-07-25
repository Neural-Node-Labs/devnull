import path from "node:path";

/**
 * Resolves `filePath` against `cwd` and guarantees the result stays inside `cwd`.
 *
 * Previously, read_tool/write_edit_tool accepted absolute paths (and relative paths
 * containing "..") with no containment check at all — `path.isAbsolute(filePath) ?
 * filePath : path.join(cwd, filePath)` was handed straight to fs with nothing stopping
 * an absolute path like "/etc/passwd" or "C:\\Users\\me\\.ssh\\id_rsa", or a relative
 * "../../../etc/passwd", from resolving outside the task's own workspace.
 *
 * That matters specifically because this agent also has tools that ingest untrusted external
 * content (site crawler, URL summarizer) into its own context — a page crafted to steer the
 * agent's next tool call could otherwise turn "read this page" into "read/write an arbitrary
 * file on this machine." Confining file tools to the workspace directory closes that off.
 *
 * Throws if the resolved path would escape `cwd`.
 */
export function resolveWithinWorkspace(filePath: string, cwd: string): string {
  const resolvedCwd = path.resolve(cwd);
  const full = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(resolvedCwd, filePath);

  // path.relative + a ".." check handles both drive-letter mismatches on Windows and normal
  // Unix path escapes; toLowerCase on Windows path comparisons only would be more correct in
  // theory, but path.resolve already normalizes casing-insensitively via the OS-native APIs.
  const rel = path.relative(resolvedCwd, full);
  const escapesWorkspace = rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);

  if (escapesWorkspace) {
    throw new Error(
      `Path "${filePath}" resolves to "${full}", which is outside the workspace root "${resolvedCwd}". ` +
        `File tools are restricted to the task workspace.`
    );
  }

  return full;
}
