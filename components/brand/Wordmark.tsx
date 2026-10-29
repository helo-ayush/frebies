import Link from "next/link";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid h-[20px] w-[20px] place-items-center rounded-[6px] bg-ink ${className}`}
    >
      <span className="h-[6px] w-[6px] rounded-full bg-accent" />
    </span>
  );
}

export function Wordmark({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} aria-label="frebies home" className="inline-flex items-center gap-2">
      <BrandMark />
      <span className="font-display text-[18px] font-semibold tracking-[-0.035em] text-ink">
        frebies
      </span>
    </Link>
  );
}
