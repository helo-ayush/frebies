/** Covers a stage while a file is held over it. */
export function DropOver({ label = "Drop to add" }: { label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center border-[3px] border-accent bg-canvas/85">
      <p className="fb-wide text-[clamp(22px,2.6vw,38px)]">{label}</p>
    </div>
  );
}
