import Link from "next/link";

/** The brand mark: an ink file with a folded corner and a coral button. */
export function LogoMark({ size = 26, invert = false }: { size?: number; invert?: boolean }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 26 26" className="shrink-0">
      <path d="M0 0h19l7 7v19H0z" fill={invert ? "#fff" : "var(--fb-ink)"} />
      <circle cx="13" cy="13" r="4.7" fill="var(--fb-coral)" />
    </svg>
  );
}

export function Wordmark({
  href = "/",
  size = 26,
  invert = false,
  onClick,
}: {
  href?: string;
  size?: number;
  invert?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label="frebies home"
      className={`flex w-fit items-center gap-2.5 ${invert ? "text-white" : "text-ink"}`}
    >
      <LogoMark size={size} invert={invert} />
      <span className="fb-wide lowercase leading-none" style={{ fontSize: size * 0.73 }}>
        frebies
      </span>
    </Link>
  );
}
