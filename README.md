# frebies

A free-first online toolbox for images, documents and audio.

- Most tools run in the browser with no account.
- A few AI tools use credits with a deferred sign-in flow.
- Every tool has its own public, indexable URL.

**Source of truth:** [PLAN.md](./PLAN.md)

## Phase 0 status

Implemented:

- Workbench shell: 264px tool index with one foldable group per category and a 64px collapsed rail (Ctrl B), both remembered between visits, 60px topbar, full-screen phone menu, Ctrl K tool search
- Custom icon set for shell navigation and all 17 tools
- Scrollbars hidden across the product while every scroll region remains usable
- Typed tool registry driving navigation, dashboard, hubs, metadata and sitemap
- `/dashboard`, `/image`, `/document`, `/audio`, `/video`
- Every tool page opens straight into its studio: a one-row header, then a studio that fills the viewport
- Shared studio kit in `components/tool/kit/` (frame, stage, dropzone, primary action, result band, history lists); the primary action sits at the top of the settings rail and docks to the bottom of the screen on phones
- Shared viewers in `components/tool/viewer/` (image with zoom, rulers and a before / after wipe; PDF reader; video deck; lightboxes) and `components/tool/audio/` (audio deck and waveforms)
- Files can be dropped anywhere on a tool page or pasted with Ctrl V (`components/tool/studio/useFileIntake.ts`)
- Dashboard: every tool as a card on one screen, with search and Free / AI filters
- Landing page (`components/landing/site/`, styles scoped in `app/(marketing)/landing.css`): pinned sideways hero with a three.js machine and stripe wipe, isometric tool launcher, box-to-card walkthrough, pricing, FAQ
- Interface sounds: 60 short CC0 recordings in `public/sounds/`, played by `lib/sound/player.ts`; each tool has its own run, drop and save sound
- Category hubs, sign-in and sign-up (Clerk), 404 and error pages
- Sign-in gate on credit tools; a guest's file and settings wait on the device for up to an hour (`lib/held-file.ts`)
- `robots.txt`, `sitemap.xml` with every canonical tool URL, JSON-LD, custom 404
- Next.js upgraded from 14.2.15 to 16.4.3
- Working on-device image tools: convert, compress, resize/crop (with a draggable crop box) and image-to-PDF
- Working on-device PDF tools: merge, split (pdf-lib) and PDF to JPG / PNG / WebP (pdf.js), with real page thumbnails
- Interface previews, not connected yet: OCR, AI PDF editor, background remover, speech to text

Not connected yet:

- Supabase project and environment keys (Phase 2)
- Razorpay (Phase 3)
- OCR, AI PDF editor, background remover and speech-to-text engines (their studios are interface previews)
- React 19 upgrade; Next 16 currently warns that React 18 is deprecated

## UI system

One design language across the landing page, the workbench and the auth pages.
Tokens and shared classes (`--fb-*`, `.fb-*`) live in `app/site.css`; shared
pieces live in `components/site/` (blocks, machine, search, kit). Tailwind's
`ink` / `line` / `panel` / `accent` palette in `tailwind.config.js` maps to the
same tokens.

Colour carries meaning on every tool: coral is free, ink uses credits, grey is
a preview that is not connected yet.

Registry components (`components/magicui/`, `components/aceternity/`,
`components/arc/`) are kept for reuse; the product pages use Arc's slider,
switch and progress.

### Magic UI MCP

The project ships MCP configs at `.mcp.json` (Claude Code and other MCP
clients) and `.cursor/mcp.json` (Cursor):

```json
{
  "mcpServers": {
    "magicuidesign": {
      "command": "npx",
      "args": ["-y", "@magicuidesign/mcp@latest"]
    }
  }
}
```

Restart the IDE after pulling so it can spawn the server. `components.json` is
also configured for the shadcn CLI, so new Magic UI components can be added
with `npx shadcn@latest add "https://magicui.design/r/<component>"` and then
checked for Tailwind 4-only utility classes.


## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

Copy `.env.example` to `.env.local` and fill in the values when the external
services are created.

## Routes

- `/` — marketing landing page
- `/dashboard` — workbench tool directory (`noindex`)
- `/image`, `/document`, `/audio` — category hubs
- `/{category}/{tool}` — all 17 tool workspaces
- `/sign-in` — sign-in preview (`noindex`)
