import "@testing-library/jest-dom/vitest"

// Radix UI (Popover) uses ResizeObserver; JSDOM doesn't provide it by default.
// Provide a minimal shim for unit/component tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class ResizeObserverShim {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverShim;
}

// SessionsTab uses IntersectionObserver for sticky Refresh visibility.
// JSDOM doesn't provide it by default.
if (typeof globalThis.IntersectionObserver === "undefined") {
  type IntersectionObserverCallbackShim = (
    entries: Array<{ intersectionRatio: number; isIntersecting: boolean; target: Element }>,
    observer: IntersectionObserver,
  ) => void;

  class IntersectionObserverShim implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "0px";
    readonly thresholds: ReadonlyArray<number> = [0];

    private readonly callback: IntersectionObserverCallbackShim;

    constructor(callback: IntersectionObserverCallbackShim) {
      this.callback = callback;
    }

    observe(target: Element): void {
      // Default to "fully visible" to avoid unexpected UI branches in tests.
      this.callback([{ intersectionRatio: 1, isIntersecting: true, target }], this);
    }

    unobserve(): void {}

    disconnect(): void {}

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.IntersectionObserver = IntersectionObserverShim as any;
}

// react-virtual relies on element measurements; JSDOM returns 0-sized rects by default.
// Provide a conservative non-zero rect for scroll containers so virtualized lists render in tests.
const __origGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
// eslint-disable-next-line @typescript-eslint/unbound-method
HTMLElement.prototype.getBoundingClientRect = function (): DOMRect {
  const rect = __origGetBoundingClientRect.call(this);
  if (rect.height > 0 && rect.width > 0) return rect;

  const el = this as HTMLElement;
  const cls = typeof el.className === "string" ? el.className : "";
  const looksScrollable = cls.includes("overflow-y-auto") || cls.includes("overflow-auto");
  if (!looksScrollable) return rect;

  const width = 800;
  const height = 600;
  const left = 0;
  const top = 0;
  const right = left + width;
  const bottom = top + height;

  return {
    x: left,
    y: top,
    width,
    height,
    top,
    left,
    right,
    bottom,
    toJSON: () => ({}),
  } as DOMRect;
};

// react-virtual (and some layout logic) reads clientHeight/clientWidth directly.
// JSDOM returns 0 for these by default; provide a non-zero fallback for scroll containers.
const __origClientHeightDesc =
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight") ??
  Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
const __origClientWidthDesc =
  Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth") ??
  Object.getOwnPropertyDescriptor(Element.prototype, "clientWidth");

if (__origClientHeightDesc?.get) {
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      const v = __origClientHeightDesc.get?.call(this) as number;
      if (v > 0) return v;
      const el = this as HTMLElement;
      const cls = typeof el.className === "string" ? el.className : "";
      const looksScrollable = cls.includes("overflow-y-auto") || cls.includes("overflow-auto");
      return looksScrollable ? 600 : v;
    },
  });
}

if (__origClientWidthDesc?.get) {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      const v = __origClientWidthDesc.get?.call(this) as number;
      if (v > 0) return v;
      const el = this as HTMLElement;
      const cls = typeof el.className === "string" ? el.className : "";
      const looksScrollable = cls.includes("overflow-y-auto") || cls.includes("overflow-auto");
      return looksScrollable ? 800 : v;
    },
  });
}