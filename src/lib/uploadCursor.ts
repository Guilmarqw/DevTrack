/**
 * Which file an upload is currently sending.
 *
 * Split out of the log component so it can be tested without a JSX runtime.
 *
 * The mapping is an approximation and the UI is worded to match. Multipart
 * framing means bytes-sent does not line up exactly with the sum of file
 * sizes, so this converts "fraction of the body sent" into a position in the
 * queue. It walks cumulative sizes rather than treating files as equal — one
 * 300 MB file among a thousand small ones would otherwise make the log race to
 * the end and sit there for the rest of the upload.
 */

export type UploadFile = { path: string; size: number };

export function cursorIndex(manifest: UploadFile[], fraction: number): number {
  if (manifest.length === 0) return 0;

  const clamped = Math.max(0, Math.min(1, fraction));
  const total = manifest.reduce((sum, file) => sum + file.size, 0);

  // Every file empty: size tells us nothing, so fall back to position. Real
  // uploads hit this with a folder of empty placeholder files.
  if (total === 0) {
    return Math.min(
      manifest.length - 1,
      Math.floor(clamped * manifest.length),
    );
  }

  const target = clamped * total;
  let running = 0;
  for (let i = 0; i < manifest.length; i += 1) {
    running += manifest[i].size;
    if (running >= target) return i;
  }
  return manifest.length - 1;
}
