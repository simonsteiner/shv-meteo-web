// A data call's value, or null after logging why it rejected, so a page
// handles a single failure case: ShvApi's weather calls answer null when
// they fail (getJson has logged it), its snapshot calls reject.

export function settled<T>(
  promise: Promise<T | null>,
  label: string,
): Promise<T | null> {
  return promise.catch((err: unknown) => {
    console.error(label, err);
    return null;
  });
}
