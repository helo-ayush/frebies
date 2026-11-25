/**
 * fontkit was compiled for browsers without generators and expects a helper it
 * does not ship. It is needed in one place only, shaping Indic scripts, so the
 * two calls made there are provided here.
 */

type Context = { prev: number; next: number; done: boolean; stop: () => void };
type Step<T> = (context: Context) => T;

const runtime = {
  mark: <T>(make: T): T => make,
  wrap<T>(step: Step<T>, _outer?: unknown, self?: unknown): IterableIterator<T> {
    const context: Context = {
      prev: 0,
      next: 0,
      done: false,
      stop() {
        context.done = true;
      },
    };
    return {
      next() {
        if (context.done) return { value: undefined, done: true };
        const value = step.call(self, context);
        return context.done ? { value: undefined, done: true } : { value, done: false };
      },
      [Symbol.iterator]() {
        return this;
      },
    };
  },
};

const scope = globalThis as { regeneratorRuntime?: unknown };
scope.regeneratorRuntime ??= runtime;

export {};
