// deno-lint-ignore-file prefer-const
export function persistedState<T>(key: string, defaults: T) {
  let value = { value: defaults };
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && "value" in parsed) {
        const saved = parsed.value;
        if (
          (defaults === undefined && (saved === undefined || typeof saved === "string")) ||
          (defaults !== undefined && typeof saved === typeof defaults && saved !== null)
        ) {
          value = { value: saved as T };
        }
      }
    }
  } catch {
    // Invalid or unavailable browser storage must not prevent WebUI rendering.
  }

  let state = $state(value);
  $effect.root(() => {
    $effect(() => {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch {
        // Continue using the in-memory value when storage is unavailable.
      }
    });
  });

  return {
    get current() {
      return state.value;
    },
    set current(value: T) {
      state.value = value;
    },
    reset() {
      state.value = defaults;
    },
    state,
  };
}
