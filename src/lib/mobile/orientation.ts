/**
 * Best-effort landscape orientation lock.
 * Browsers may reject unless the app is fullscreen/installed and call is
 * triggered by a user gesture. Silent fail is acceptable.
 */
export async function lockLandscape(): Promise<void> {
  try {
    const so = (typeof screen !== "undefined" ? screen.orientation : undefined) as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined;
    if (so?.lock) await so.lock("landscape");
  } catch {
    /* unsupported or not allowed */
  }
}
