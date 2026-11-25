/** Runs pdf.js renders one after another so a long document never floods the worker. */
export function createRenderQueue() {
  let chain: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = chain.then(job, job);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export type RenderQueue = ReturnType<typeof createRenderQueue>;
