# frebies

A free-first online toolbox for images, documents and audio.

- Most tools run in the browser with no account.
- A few AI tools use credits with a deferred sign-in flow.
- Every tool has its own public, indexable URL.

**Source of truth:** [PLAN.md](./PLAN.md)

## Phase 0 status

Implemented:

- Workbench shell: 264px sidebar with a 72px collapsed rail, 56px topbar, mobile drawer, ⌘K tool search
- Custom rounded-outline icon set for shell navigation and all 16 tools
- Scrollbars hidden across the product while every scroll region remains usable
- Typed tool registry driving navigation, dashboard, hubs, metadata and sitemap
- `/dashboard`, `/image`, `/document`, `/audio`
- Tool-specific static UI previews for all 16 registry tools
- Editorial dashboard with a live launcher, layered workspace illustration, category cards, list/grid directory and credits/activity panels
- Restored warm editorial landing with animated tool carousel and a full workbench preview section
- Richer category hubs, sign-in preview and custom 404
- Guest-only credit locks, credit cost badges, disabled processing actions
- `robots.txt`, `sitemap.xml` with every canonical tool URL, JSON-LD, custom 404
- Next.js upgraded from 14.2.15 to 16.4.3

Not connected yet:

- Supabase project and environment keys (Phase 2)
- Razorpay (Phase 3)
- Actual tool engines (Phase 1)
- React 19 upgrade; Next 16 currently warns that React 18 is deprecated

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
- `/{category}/{tool}` — all 16 tool workspaces (UI previews; engines not connected)
- `/sign-in` — sign-in preview (`noindex`)
