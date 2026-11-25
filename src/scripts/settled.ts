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

/** Hands `call`'s value to `use`, or calls `onFail` when the call failed
 * or `use` threw while drawing it (both logged under `label`). */
export function settledInto<T>(
  call: Promise<T | null>,
  label: string,
  use: (data: T) => void,
  onFail: () => void,
): Promise<void> {
  return settled(call, label).then((data) => {
    if (!data) return onFail();
    try {
      use(data);
    } catch (err) {
      console.error(label, err);
      onFail();
    }
  });
}
