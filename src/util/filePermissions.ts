import os from "node:os";
import { spawnSync } from "node:child_process";

/**
 * Restricts a file to the current user only, on whichever platform we're on.
 *
 * On POSIX, callers already pass `{ mode: 0o600 }` to `fs.writeFileSync`, which is sufficient
 * on its own. On Windows, that mode argument is a no-op -- NTFS doesn't use POSIX permission
 * bits, so a file written with mode 0600 on Windows is still readable by any other local
 * account with filesystem access. This uses `icacls` (present on every Windows version we'd
 * realistically run on) to strip inherited permissions and grant full control to only the
 * current user, which is the actual Windows equivalent of what mode 0600 does elsewhere.
 *
 * Call this AFTER writing the file with `{ mode: 0o600 }` -- it only does anything on Windows,
 * so the POSIX mode argument still needs to stay in every call site's writeFileSync.
 *
 * Deliberately best-effort: failures are logged, not thrown. A permissions-hardening step
 * failing shouldn't block whatever the caller was actually trying to save -- it should just
 * mean the file is back to being readable by other local accounts on the machine, which is a
 * narrower, more honest failure mode than crashing the whole operation over it.
 */
export function restrictFileToCurrentUser(filePath: string): void {
  if (os.platform() !== "win32") return;
  try {
    const username = os.userInfo().username;
    const result = spawnSync("icacls", [filePath, "/inheritance:r", "/grant:r", `${username}:F`], {
      windowsHide: true,
    });
    if (result.status !== 0) {
      console.error(
        `[filePermissions] icacls could not restrict permissions on ${filePath} (exit ${result.status}). ` +
          `This file may be readable by other local accounts on this machine.`
      );
    }
  } catch (err) {
    console.error(`[filePermissions] Failed to run icacls on ${filePath}: ${err}`);
  }
}
