export function MiniWaveform({
  peaks,
  progress = 0.42,
  bars = 42,
  height = 34,
  tone = "sage",
  seed = 0,
}: {
  peaks?: number[];
  progress?: number;
  bars?: number;
  height?: number;
  tone?: "sage" | "coral" | "ink";
  seed?: number;
}) {
  const source =
    peaks && peaks.length > 0
      ? Array.from({ length: bars }, (_, index) => {
          const cursor = Math.floor((index / bars) * peaks.length);
          return peaks[cursor] ?? 0.2;
        })
      : Array.from({ length: bars }, (_, index) => {
          const wave =
            Math.abs(Math.sin((index + seed * 1.7) * 0.55)) *
            (0.55 + 0.45 * Math.abs(Math.sin((index + seed) * 0.21)));
          return Math.max(0.12, wave);
        });

  return (
    <div
      aria-hidden
      className="flex w-full items-center gap-[2px]"
      style={{ height }}
    >
      {source.map((peak, index) => {
        const played = index / source.length <= progress;
        return (
          <span
            key={index}
            className={`w-full flex-1 rounded-full ${
              played
                ? tone === "coral"
                  ? "bg-accent"
                  : tone === "ink"
                    ? "bg-ink"
                    : "bg-[#8fae9f]"
                : "bg-[#ddd8cd]"
            }`}
            style={{ height: `${Math.max(10, peak * 100)}%` }}
          />
        );
      })}
    </div>
  );
}
