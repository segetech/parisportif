// Patch ResizeObserver to schedule callbacks on the next animation frame
// This mitigates "ResizeObserver loop completed with undelivered notifications" warnings in Chromium
// without altering library usage sites.

if (
  typeof window !== "undefined" &&
  typeof window.ResizeObserver !== "undefined"
) {
  const OriginalResizeObserver = window.ResizeObserver;

  class PatchedResizeObserver implements ResizeObserver {
    private _ro: ResizeObserver;

    constructor(callback: ResizeObserverCallback) {
      this._ro = new OriginalResizeObserver((entries, observer) => {
        // Defer to the next frame to avoid nested resize/measure loops
        requestAnimationFrame(() => callback(entries, observer));
      });
    }

    disconnect(): void {
      this._ro.disconnect();
    }

    observe(target: Element, options?: ResizeObserverOptions): void {
      this._ro.observe(target, options);
    }

    unobserve(target: Element): void {
      this._ro.unobserve(target);
    }

    // Some browsers support takeRecords; keep it if available
    takeRecords?(): ResizeObserverEntry[] {
      const anyRO = this._ro as any;
      return typeof anyRO.takeRecords === "function" ? anyRO.takeRecords() : [];
    }
  }

  // Replace global ResizeObserver with the patched version
  (window as any).ResizeObserver =
    PatchedResizeObserver as unknown as typeof OriginalResizeObserver;

  // Suppress the noisy browser-level error event specifically for this known benign case
  window.addEventListener(
    "error",
    (e) => {
      if (
        typeof e.message === "string" &&
        e.message.includes("ResizeObserver loop")
      ) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true,
  );
}
