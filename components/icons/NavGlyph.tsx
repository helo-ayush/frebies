import type { ReactNode, SVGProps } from "react";

type GlyphProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  size?: number;
};

function Glyph({ size = 18, children, ...props }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4.25 10.2 12 4.05l7.75 6.15v8.05a1.75 1.75 0 0 1-1.75 1.75H6a1.75 1.75 0 0 1-1.75-1.75V10.2Z" />
      <path d="M9.25 20v-4.55c0-.69.56-1.25 1.25-1.25h3c.69 0 1.25.56 1.25 1.25V20" />
    </Glyph>
  );
}

export function ToolsGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3.75" y="3.75" width="6.5" height="6.5" rx="1.9" />
      <rect x="13.75" y="3.75" width="6.5" height="6.5" rx="1.9" />
      <rect x="3.75" y="13.75" width="6.5" height="6.5" rx="1.9" />
      <rect x="13.75" y="13.75" width="6.5" height="6.5" rx="1.9" />
    </Glyph>
  );
}

export function PanelGlyph({ collapsed = false, ...props }: GlyphProps & { collapsed?: boolean }) {
  return (
    <Glyph {...props}>
      <rect x="3.25" y="4.25" width="17.5" height="15.5" rx="3" />
      <path d="M9.2 4.5v15" />
      {collapsed ? (
        <path d="m5.15 9.35 1.45 1.35-1.45 1.35" />
      ) : (
        <path d="m7.75 9.35-1.45 1.35 1.45 1.35" />
      )}
    </Glyph>
  );
}

export function ChevronGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m9.5 6.5 5.5 5.5-5.5 5.5" />
    </Glyph>
  );
}

export function ArrowRightGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4.75 12h14.5M14 6.75 19.25 12 14 17.25" />
    </Glyph>
  );
}

export function SearchGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m15.5 15.5 4.25 4.25" />
    </Glyph>
  );
}

export function MenuGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4.25 8.25h15.5M4.25 15.75h15.5" />
    </Glyph>
  );
}

export function CloseGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
    </Glyph>
  );
}

export function SparkGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M11.8 3.3c.6 4.55 2.1 6.05 6.65 6.65-4.55.6-6.05 2.1-6.65 6.65-.6-4.55-2.1-6.05-6.65-6.65 4.55-.6 6.05-2.1 6.65-6.65Z" />
      <path d="M18.65 15.35c.17 1.27.61 1.71 1.88 1.88-1.27.17-1.71.61-1.88 1.88-.17-1.27-.61-1.71-1.88-1.88 1.27-.17 1.71-.61 1.88-1.88Z" />
    </Glyph>
  );
}

export function LockGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="5.25" y="10.1" width="13.5" height="10.35" rx="3" />
      <path d="M8.5 10V7.8a3.5 3.5 0 1 1 7 0V10" />
      <path d="M12 14.15v2.25" />
    </Glyph>
  );
}

export function ToolGlyph({ path, ...props }: GlyphProps & { path: string }) {
  switch (path) {
    case "/image/convert":
      return (
        <Glyph {...props}>
          <rect x="3.25" y="6.25" width="13.5" height="13.5" rx="3" />
          <circle cx="7.5" cy="10.5" r="1.25" />
          <path d="m4.9 17.4 3.25-3.25a1.6 1.6 0 0 1 2.25 0l2.02 2.02 1.12-1.12a1.6 1.6 0 0 1 2.25 0l1.15 1.15" />
          <path d="M16.35 8.9h4.3M18 6.45l2.65 2.45L18 11.35" />
        </Glyph>
      );
    case "/image/compress":
      return (
        <Glyph {...props}>
          <rect x="4" y="4" width="16" height="16" rx="3.5" />
          <path d="m9.2 9.2 2.8 2.8 2.8-2.8" />
          <path d="m9.2 14.8 2.8-2.8 2.8 2.8" />
        </Glyph>
      );
    case "/image/resize":
      return (
        <Glyph {...props}>
          <path d="M7.25 3.5v13.25H20.5" />
          <path d="M3.5 7.25h13.25V20.5" />
        </Glyph>
      );
    case "/image/to-pdf":
      return (
        <Glyph {...props}>
          <rect x="3.25" y="6.25" width="10.5" height="9" rx="2.25" />
          <circle cx="6.65" cy="9.55" r="1" />
          <path d="m4.5 14.2 2.15-2.15a1.3 1.3 0 0 1 1.84 0l1.36 1.36 1-1a1.3 1.3 0 0 1 1.84 0l.8.8" />
          <path d="M16.9 3.5h2.35a1.75 1.75 0 0 1 1.75 1.75v13A1.75 1.75 0 0 1 19.25 20H14.5" />
          <path d="M15.45 9.4H11.8m0 0 1.55-1.55M11.8 9.4l1.55 1.55" />
        </Glyph>
      );
    case "/image/upscaler":
      return (
        <Glyph {...props}>
          <path d="M10.25 3.6c.58 4.2 1.95 5.57 6.15 6.15-4.2.58-5.57 1.95-6.15 6.15-.58-4.2-1.95-5.57-6.15-6.15 4.2-.58 5.57-1.95 6.15-6.15Z" />
          <path d="M16.2 16.1h4.55v4.55" />
          <path d="m20.45 16.4-4.2 4.2" />
        </Glyph>
      );
    case "/image/remove-background":
      return (
        <Glyph {...props}>
          <path d="M14.15 3.85 21.4 11.1a1.9 1.9 0 0 1 0 2.69l-4.85 4.85a1.9 1.9 0 0 1-2.69 0l-7.1-7.1a1.9 1.9 0 0 1 0-2.69l4.7-5a1.9 1.9 0 0 1 2.69 0Z" />
          <path d="m8.2 8.4 8.2 8.4" />
          <path d="M12.4 21.2h8.1" />
        </Glyph>
      );
    case "/document/merge-pdf":
      return (
        <Glyph {...props}>
          <path d="M8.1 6.1h9.1a2 2 0 0 1 2 2v11.4a2 2 0 0 1-2 2H8.1a2 2 0 0 1-2-2V8.1a2 2 0 0 1 2-2Z" />
          <path d="M6.1 15.6H4.8a2 2 0 0 1-2-2V4.9a2 2 0 0 1 2-2h8.7a2 2 0 0 1 2 2v1.2" />
          <path d="M12.65 10.25v6.5M9.4 13.5h6.5" />
        </Glyph>
      );
    case "/document/split-pdf":
      return (
        <Glyph {...props}>
          <path d="M9.2 3.5H5.75a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2H9.2" />
          <path d="M14.8 3.5h3.45a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H14.8" />
          <path d="M12 3.5v3.1M12 9v2M12 13.2v2M12 18v2.5" />
        </Glyph>
      );
    case "/document/pdf-to-jpg":
      return (
        <Glyph {...props}>
          <path d="M6.1 3.5h8.35l4.3 4.3v12.7H6.1a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" />
          <path d="M14.25 3.75V8.1h4.25" />
          <rect x="7.95" y="12.4" width="7.6" height="5.7" rx="1.4" />
          <circle cx="10.05" cy="14.55" r=".65" />
          <path d="m8.65 17.25 1.4-1.4 1.25 1.25.8-.8 1.3 1.3" />
        </Glyph>
      );
    case "/document/ocr":
      return (
        <Glyph {...props}>
          <path d="M8 3.5H5.5a2 2 0 0 0-2 2V8M16 3.5h2.5a2 2 0 0 1 2 2V8M3.5 16v2.5a2 2 0 0 0 2 2H8M20.5 16v2.5a2 2 0 0 1-2 2H16" />
          <path d="M8 8.5h8M8 12h6M8 15.5h4" />
        </Glyph>
      );
    case "/document/ai-editor":
      return (
        <Glyph {...props}>
          <path d="M6.3 3.5h7.9l4.55 4.55v12.7H6.3a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
          <path d="M14 3.75v4.55h4.5" />
          <path d="M10.05 11.05c.35 2.36 1.11 3.12 3.47 3.47-2.36.35-3.12 1.11-3.47 3.47-.35-2.36-1.11-3.12-3.47-3.47 2.36-.35 3.12-1.11 3.47-3.47Z" />
        </Glyph>
      );
    case "/audio/convert":
      return (
        <Glyph {...props}>
          <path d="M3.6 10.2v3.6M6.8 7.6v8.8M10 4.8v14.4M13.2 8.1v7.8M16.4 10.4v3.2" />
          <path d="M17.25 8.2h3.5m0 0-1.75-1.75M20.75 8.2l-1.75 1.75" />
          <path d="M17.25 15.8h3.5m0 0-1.75 1.75M20.75 15.8l-1.75-1.75" />
        </Glyph>
      );
    case "/audio/trim":
      return (
        <Glyph {...props}>
          <path d="M5.6 4.5v15M18.4 4.5v15" />
          <path d="M3.4 4.5h4.4M16.2 4.5h4.4M3.4 19.5h4.4M16.2 19.5h4.4" />
          <path d="M9.45 9.25v5.5M12 7.2v9.6M14.55 9.25v5.5" />
        </Glyph>
      );
    case "/audio/text-to-speech":
      return (
        <Glyph {...props}>
          <path d="M5.2 4.5h13.6a2.2 2.2 0 0 1 2.2 2.2v8.1a2.2 2.2 0 0 1-2.2 2.2h-5.15l-4.15 3v-3H5.2A2.2 2.2 0 0 1 3 14.8V6.7a2.2 2.2 0 0 1 2.2-2.2Z" />
          <path d="M8.2 9.4v2.2M11 7.4v6.2M13.8 9.4v2.2M16.5 8.4v4.2" />
        </Glyph>
      );
    case "/audio/speech-to-text":
      return (
        <Glyph {...props}>
          <path d="M5.2 4.5h13.6a2.2 2.2 0 0 1 2.2 2.2v8.1a2.2 2.2 0 0 1-2.2 2.2h-5.15l-4.15 3v-3H5.2A2.2 2.2 0 0 1 3 14.8V6.7a2.2 2.2 0 0 1 2.2-2.2Z" />
          <path d="M7.5 8.7h9M7.5 12.1h6" />
          <path d="M15.8 12.1h.7" />
        </Glyph>
      );
    case "/audio/vocal-remover":
      return (
        <Glyph {...props}>
          <path d="M9.4 17.55V6.3l8.45-1.85v10.8" />
          <path d="M9.4 9.05 17.85 7.2" />
          <ellipse cx="6.85" cy="17.75" rx="2.55" ry="2.1" transform="rotate(-14 6.85 17.75)" />
          <ellipse cx="15.3" cy="15.4" rx="2.55" ry="2.1" transform="rotate(-14 15.3 15.4)" />
          <path d="m4 4.2 16 16" />
        </Glyph>
      );
    default:
      return (
        <Glyph {...props}>
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <path d="M8.5 12h7M12 8.5v7" />
        </Glyph>
      );
  }
}
