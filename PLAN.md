# frebies — Product, Architecture & Build Plan

> **Single source of truth for the frebies tool SaaS.**
> Last updated: 2026-10-29
> Status: planning complete. No tool engines built yet.
> Decisions marked **Confirmed** are binding unless changed in section 20.

---

## Contents

0. [Executive summary](#0-executive-summary)
1. [Product principles](#1-product-principles)
2. [Confirmed decisions](#2-confirmed-decisions)
3. [Surfaces, routes and indexability](#3-surfaces-routes-and-indexability)
4. [User states and flows](#4-user-states-and-flows)
5. [The pending-run mechanism](#5-the-pending-run-mechanism)
6. [Authentication with Supabase](#6-authentication-with-supabase)
7. [Credits](#7-credits)
8. [Payments with Razorpay](#8-payments-with-razorpay)
9. [Storage and files](#9-storage-and-files)
10. [Tool execution architecture](#10-tool-execution-architecture)
11. [SEO architecture](#11-seo-architecture)
12. [Design system](#12-design-system)
13. [Tool catalog and build phases](#13-tool-catalog-and-build-phases)
14. [Data model](#14-data-model)
15. [API surface](#15-api-surface)
16. [Security, privacy and legal](#16-security-privacy-and-legal)
17. [Analytics and monitoring](#17-analytics-and-monitoring)
18. [Environment and deployment](#18-environment-and-deployment)
19. [Current codebase and migration notes](#19-current-codebase-and-migration-notes)
20. [Open decisions](#20-open-decisions)
21. [Decision log](#21-decision-log)

---

## 0. Executive summary

frebies is a free-first online tool SaaS for **documents, images and audio**.

- **Most tools are free** and run entirely in the browser: no account, no upload, no watermark.
- **A few AI/heavy tools use credits.** Their pages are still completely public and readable. Guests can fill in the tool; authentication is requested only when they click the final run button. Their input is preserved and the run auto-resumes after sign-in.
- **One UI, one URL per tool.** Every tool lives at a public, indexable URL (for example `/image/upscaler`) inside the same workbench shell used by the dashboard. There is no separate marketing version of a tool.
- `/dashboard` is a **directory page** for people who do not know which tool they want. It is `noindex`. Search traffic goes directly to the tool URL.
- **Auth, database and storage:** Supabase (Google OAuth + 6-digit email OTP, Postgres, private Storage buckets).
- **Payments:** Razorpay (INR subscriptions plus one-time credit top-ups).
- **Stack:** Next.js App Router, TypeScript, Tailwind CSS, Lucide, Supabase, Razorpay, Vercel.
- **MVP target:** roughly 6–8 weeks solo, with free tools shippable before accounts exist.

**The whole model in one diagram:**

```
Google search ──► /image/upscaler (public, static, workbench shell)
                        │
                        ├─ free tool  ──► browser (Canvas / pdf-lib / ffmpeg.wasm)
                        │                 no account, no upload
                        │
                        └─ credit tool ──► fill input locally
                                           click "Upscale · 2 credits"
                                           save pending run in IndexedDB
                                           sign in (Google / email OTP)
                                           restore input → check credits
                                           upload → provider API → result
                                           deduct 2 credits, delete files after 1h

Home ──► "Get started" ──► /dashboard (noindex directory) ──► tool URL
```

**Non-negotiables**

1. Never put the main content behind auth. Only the action is gated.
2. Never collapse tools into one `/dashboard` URL or query parameters.
3. Never create a second UI for signed-in users.
4. Free tools never ask for an account.
5. Every paid run shows its credit cost before login.
6. Credits are spent and refunded atomically and idempotently.
7. Public tool pages are statically rendered, fast and crawlable.

---

## 1. Product principles

1. **Free first.** The majority of tools cost nothing to run and stay free. Credits exist to cover genuinely expensive AI processing, not to squeeze basic utilities.
2. **One tool, one URL, one UI.** The workbench shell is shared. Each tool adds its own center panel and SEO content. There is no “marketing tool page” and “app tool page”.
3. **Gate the action, not the page.** A guest can see and configure every tool. Only execution may require an account.
4. **Preserve user work.** Anything typed, uploaded or configured before sign-in must survive the auth flow.
5. **Honest pricing.** Cost is visible on the button. No surprise paywall after uploading.
6. **Privacy by default.** Client-side tools never upload files. Server tools use private buckets and short retention.
7. **Calm interface.** White canvas, hairline borders, small precise controls, almost no color. The UI should feel like a professional workbench, not a marketing splash.
8. **SEO is a product feature.** Each tool page is a real landing page with unique content, not an app screen with a canonical.
9. **Simple mechanisms.** No websockets, no realtime sync, no queue infrastructure at launch. Refresh-on-load is acceptable freshness; short polling only for long AI jobs.
10. **Accurate claims.** Never advertise formats, limits or retention that the system does not actually honor.

**Non-goals for launch**

- Team accounts, seats or shared workspaces.
- Public API or API keys.
- Video tools.
- Native mobile apps.
- Real-time collaboration.
- Self-hosted AI models (use providers initially).
- Separate marketing pages that duplicate tool pages.

---

## 2. Confirmed decisions

| Area | Decision | Consequence |
|---|---|---|
| Framework | Next.js App Router (upgrade the current 14.2.15 scaffold to current stable before Phase 1) | Static tool pages, route handlers, Metadata API |
| UI | TypeScript, Tailwind CSS, Lucide, Radix-based accessible primitives | Keep the existing Tailwind 3 setup initially |
| Auth | **Supabase Auth** — Google OAuth + 6-digit email OTP | No password storage; custom SMTP for production |
| Database | **Supabase Postgres** with RLS | Credits, runs, subscriptions, ledger |
| File storage | **Supabase Storage** private buckets with signed URLs | Inputs and outputs expire automatically via cron |
| Payments | **Razorpay** subscriptions + one-time orders | INR pricing; GST handling remains with us |
| SEO model | **One public URL per tool**, statically generated | Tool pages rank independently; dashboard is `noindex` |
| Chrome | Marketing top nav on `/`, `/pricing`, `/blog`, legal. Workbench sidebar + topbar on `/dashboard`, categories and tools | One shell across the app |
| Guest behaviour | Free tools usable with no account; paid tools open with deferred auth at run | Maximum conversion and full SEO content |
| Paid tool indicator | Small guest-only lock icon next to tool name, plus credit cost on buttons | Communicates credit use without disabling the page |
| Input preservation | IndexedDB pending run + POST-auth restore + auto-run | OAuth redirects never lose user work |
| Sign-in methods | Google OAuth + 6-digit email OTP, **not** magic links | Keeps the original tab and pending state |
| Welcome credits | 25 one-time credits per verified account | Enough to try several AI tools |
| Runtime | Browser for free tools; third-party APIs for paid AI; workers only at volume | Low fixed cost and fast launch |
| Realtime | None | No websockets; refresh after actions; bounded polling for long jobs |
| Currency | INR | Plan copy and checkout in ₹ |

---

## 3. Surfaces, routes and indexability

### 3.1 Surfaces

| Surface | Purpose | Chrome | Indexable |
|---|---|---|---|
| Marketing | Brand, value proposition, pricing, content | 76px editorial top nav with announcement, no sidebar, no login | Yes |
| Workbench | Dashboard, category hubs, tool pages | 264px sidebar (72px collapsed) + 56px topbar | Tools and hubs yes; dashboard no |
| Auth | Sign-in, OAuth callback | Minimal centered page | No |
| Account | Profile, usage, billing | Workbench shell | No |
| API | Runs, uploads, billing, cron | None | No |

### 3.2 Route map

**Marketing**

```
/                         Landing page
/pricing                  Plans and credit explainer
/blog                     Guides index
/blog/[slug]              Individual guide
/about                    Story and contact
/legal/privacy            Privacy policy
/legal/terms              Terms of service
/legal/cookies            Cookie policy
/legal/refunds            Refund and cancellation policy
```

**Workbench**

```
/dashboard                          Tool directory (noindex)
/image                              Image tools hub
/image/convert                      Image converter
/image/compress                     Image compressor
/image/resize                       Resize / crop
/image/to-pdf                       Image to PDF
/image/upscaler                     AI upscaler (2 credits)
/image/remove-background            Background remover (1 credit)
/image/heic-to-jpg                  Programmatic converter preset
/image/compress-to-100kb            Programmatic size preset
/document                           Document tools hub
/document/merge-pdf                 Merge PDF
/document/split-pdf                 Split PDF
/document/pdf-to-jpg                PDF to JPG
/document/ocr                       OCR (1 credit)
/document/ai-editor                 AI PDF editor (3 credits)
/audio                              Audio tools hub
/audio/convert                      Audio converter
/audio/trim                         Audio trimmer
/audio/text-to-speech               TTS (1 credit / 1k chars)
/audio/speech-to-text               STT (2 credits / min)
```

**Auth and account**

```
/sign-in                 Google + email OTP
/auth/callback           Supabase OAuth code exchange
/account                 Profile and plan summary (protected)
/account/usage           Credit ledger and run history (protected)
/account/billing         Plan, payment method, invoices (protected)
```

**Internal API**

```
/api/uploads/sign                    Signed upload URL
/api/runs                            Create / execute a run
/api/runs/[id]                       Run status and result
/api/billing/checkout                Create Razorpay subscription/order
/api/billing/confirm                 Verify checkout signature, grant idempotently
/api/billing/webhook/razorpay        Razorpay webhook (raw body)
/api/cron/cleanup                    Delete expired files/runs
```

### 3.3 Indexing rules

| Page | robots |
|---|---|
| Marketing pages | index, follow |
| Category hubs | index, follow |
| Tool pages | index, follow |
| Programmatic tool pages | index, follow **only if** they pass the quality gate (section 11.6) |
| `/dashboard` | noindex, follow |
| `/account/*`, `/sign-in`, `/auth/*` | noindex, nofollow |
| `/api/*` | blocked by robots, never linked |

### 3.4 Why not send search traffic to `/dashboard`

Google ranks **URLs with specific content**, not app screens.

- One dashboard URL can have only one title, one H1 and one content set; it cannot rank for upscaler, compressor, merger and TTS at the same time.
- Query variants like `/dashboard?tool=upscaler` are not separate indexable pages.
- Dashboards are user-specific and usually `noindex`; making one public would still make it a thin generic page.
- It adds a click and a choice between the searcher and the tool.
- It gives ads, backlinks and analytics no per-tool landing page.

**The rule:** shared shell, many semantic URLs. The “app” is the layout, not the `/dashboard` prefix.

---

## 4. User states and flows

### 4.1 State matrix

| Visitor state | Free tool | Credit tool |
|---|---|---|
| Guest | Use immediately; no account; no upload for client tools | Page fully open; fill input; auth requested at run |
| Signed in, enough credits | Use; no deduction | Run; deduct cost |
| Signed in, insufficient credits | Use | Upgrade / top-up dialog; input preserved |
| Expired session | Free tools still work | Re-authenticate, then resume pending run |
| Rate-limited | Clear retry time | Clear retry time; no charge |

### 4.2 Guest + free tool

1. Guest searches `compress image` and lands on `/image/compress`.
2. The workbench shell renders with the sidebar and a top-right **Sign in** button.
3. They pick a file; processing happens locally in the browser.
4. They download the result. No account, no upload, no credits.
5. After the download, a dismissible, non-blocking nudge may offer “Sign in to keep your history and get 25 credits for AI tools.”
6. The tool page includes full SEO content below the tool.

### 4.3 Guest + credit tool (the critical flow)

Example: `/image/upscaler`.

1. Page loads fully. H1, description, options, FAQs and related tools are visible.
2. In the sidebar, “Image Upscaler” has a small lock icon for guests. The dropzone and options are **enabled**.
3. Guest selects a file (kept in browser memory / IndexedDB), sets scale and output format. No upload yet.
4. They click **“Upscale · 2 credits”**.
5. A compact dialog opens:
   > **Sign in to run this upscale**
   > Your file stays in this browser until you continue.
   > New accounts get 25 free credits. This run uses 2.
   > [Continue with Google] [Email me a 6-digit code]
6. They authenticate via Google OAuth or email OTP.
7. They return to the **same URL**. The pending run is restored from IndexedDB; the file and options reappear.
8. The session is verified and the balance is checked.
9. If credits are sufficient, the tool uploads the file, starts the run and shows progress. Cost is deducted once.
10. On success, the result appears with a download button; the pending run is cleared; balance updates in the topbar.
11. On failure, credits are refunded, a clear error is shown, and the input remains for retry.

If they cancel sign-in, the pending run stays for up to 60 minutes and the button reads “Sign in to run · 2 credits”.

### 4.4 Signed-in + credit tool

1. Page loads; topbar shows the credit balance and avatar.
2. Guest-only lock icons are gone. Credit costs remain visible on buttons.
3. They configure and click **“Upscale · 2 credits”**.
4. Credits are checked and deducted; the run starts immediately.
5. If the balance is insufficient, the upgrade dialog opens before any upload. Input stays.

### 4.5 Insufficient credits

1. The user has 1 credit and the tool costs 2.
2. Clicking run opens a dialog:
   > You need 2 credits and have 1.
   > [Upgrade to Starter] [Buy 100 credits]
3. Input remains saved.
4. After a successful Razorpay payment confirmation, the pending run resumes automatically (same idempotency key, no double charge).
5. If they close the dialog, the input is still there when they return.

### 4.6 Failure and refund

| Failure | User sees | Charge |
|---|---|---|
| Unsupported / corrupt file | “We couldn’t read this file. Try JPG, PNG or WebP.” | Not charged |
| File too large | Exact limit and a link to the compressor | Not charged |
| Provider timeout / error | “The AI service didn’t finish. No credits were used. Try again.” | Refunded |
| Storage save failure | “We couldn’t save your result.” | Refunded |
| User closes tab mid-run | Run completes server-side; result valid for 1 hour; history shows it | Charged if provider succeeded |
| Rate limited | Retry time | Not charged |

Refunds are idempotent. A run never leaves the balance negative.

### 4.7 First-time vs returning user

- **First sign-in:** Supabase trigger creates a profile and grants 25 welcome credits once. The modal already promised them; the balance pill updates after redirect.
- **Returning:** existing balance loads; no welcome grant.
- **Signed in on another device:** pending runs are local to the browser. Show a clean state; never promise a file that is not there.

### 4.8 Free tools after sign-in

Nothing changes except:
- The topbar shows credits and avatar.
- A non-blocking “History is saved” note may appear on the dashboard.
- Free tools still cost 0 credits.

---

## 5. The pending-run mechanism

This is the highest-risk UX piece and must be built and tested early.

### 5.1 What is stored

IndexedDB, one record per active pending run:

```ts
type PendingRun = {
  id: string;                 // client-generated UUID, also used as idempotency key
  toolSlug: string;
  file?: Blob;                // image / PDF / audio input, never uploaded before auth
  fileName?: string;
  mime?: string;
  size?: number;
  text?: string;              // TTS / AI editor input
  options: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;          // createdAt + 60 minutes
  autoRun: boolean;
};
```

- Use `idb-keyval` (small wrapper) with a dedicated store such as `frebies.pendingRuns`.
- Key by `toolSlug` so “resume the upscaler” is deterministic. A second configuration for the same tool replaces the first.
- **Never** store file contents in `localStorage`, `sessionStorage` or the URL.
- Store only small metadata in `sessionStorage` if a redirect hint is needed (optional).

### 5.2 Lifecycle

1. User clicks run while guest.
2. Create the `PendingRun` **before** opening auth.
3. Open `/sign-in?next=/image/upscaler`.
4. After auth, return to the safe relative `next`.
5. Read pending run by tool slug; if expired, delete and show a normal empty state.
6. Restore file, text and options into the tool state.
7. Verify the user and balance via Supabase/API.
8. If `autoRun` and credits are sufficient: upload and execute with `idempotencyKey = pending.id`.
9. On success or definitive failure: delete the pending record.
10. On auth cancellation/failure: keep it until expiry.
11. On a new run, overwrite the record.

### 5.3 Auto-run rules

- Tools costing **1–5 credits**: auto-run after login, because clicking the run button was explicit intent.
- Tools costing **more than 5 credits** (long audio, expensive edits): restore the input and require one final click with the cost visible.
- The sign-in dialog always states the exact cost before auth.
- If credits are insufficient after login, do **not** auto-run; open the upgrade path instead.
- After an upgrade succeeds, resume the pending run using the same idempotency key.

### 5.4 Idempotency

- `pending.id` is sent as `Idempotency-Key` on `POST /api/runs`.
- `tool_runs.idempotency_key` has a unique index.
- A duplicate request returns the existing run instead of creating a new one or charging again.
- A page refresh after a successful request must not re-charge.
- The same key is used when resuming after an upgrade.

### 5.5 Edge cases

| Case | Handling |
|---|---|
| Google OAuth redirect | IndexedDB persists on the same origin; restore normally |
| Email magic link opened in another browser | Avoid magic links; use a 6-digit OTP in the same tab |
| Safari private mode / storage quota | Detect failure; ask the user to sign in before selecting the file |
| File larger than storage quota | Enforce file limits before saving; show a clear message |
| User closes the tab after auth but before run | Pending remains 60 minutes; next visit restores with a “Resume” notice |
| User signs in on another device | No pending file; show the normal empty state |
| Multiple tabs | Each pending record is keyed by tool; last write wins; runs remain idempotent |
| Auth session expires mid-run | API returns 401; input is preserved; after re-auth, resume with the same key |
| Pending run expires | Delete silently; show normal state with a one-line “Previous input expired” notice |
| Run fails after provider success but storage fails | Mark failed, refund, keep input |

### 5.6 Acceptance tests

- Guest uploads an image, signs in with Google, and the same file appears and runs exactly once.
- Guest enters TTS text, signs in with email OTP, and the text survives.
- Cancelling the auth dialog preserves the file for the next attempt.
- Refreshing after a successful request does not create a second run.
- Signing in with insufficient credits preserves the input and does not charge.
- Auto-run never executes when the pending run is expired.

---

## 6. Authentication with Supabase

### 6.1 Providers

- **Google OAuth** via Supabase.
- **Email OTP** with a 6-digit code, not a magic link. The OTP keeps the user in the same tab, which preserves the pending-run state.
- No passwords at launch.

### 6.2 Client setup

- Use `@supabase/ssr`.
- Browser client in client components and auth UI.
- Server client in protected account pages and API routes.
- Service-role client **only** on the server for privileged writes (credits, runs, billing).
- Configure Site URL and redirect URLs in Supabase:
  - `https://frebies.com/auth/callback`
  - `http://localhost:3000/auth/callback`

### 6.3 OAuth flow

1. User clicks “Continue with Google”.
2. `signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } })`.
3. Google redirects back with a code.
4. `/auth/callback` exchanges the code for a session.
5. Validate `next`:
   - Must be a relative path starting with `/`.
   - Must not start with `//` or contain a scheme.
   - Reject anything else; fall back to `/dashboard`.
6. Redirect to the validated `next`.

### 6.4 Email OTP flow

1. `signInWithOtp({ email, options: { shouldCreateUser: true } })`.
2. Supabase sends an email template containing `{{ .Token }}` (6-digit code).
3. User enters the code in the same tab.
4. `verifyOtp({ email, token, type: 'email' })`.
5. Session is created; the pending run restores on the same page.
6. Rate-limit OTP requests per email/IP; show a resend timer.

### 6.5 Profile creation and welcome credits

- A Postgres trigger on `auth.users` insert creates a `profiles` row.
- The same trigger (or a security-definer function) grants 25 welcome credits:
  - Ledger row with `reason = 'welcome'`.
  - `idempotency_key = 'welcome:' || user_id`.
  - `welcome_granted_at` set.
- The trigger must be idempotent: repeated invocation never grants twice.
- Google accounts are verified by Google; email accounts are verified by OTP.

### 6.6 Email deliverability

- Configure custom SMTP (Resend or similar) before launch.
- Set a branded sender, SPF/DKIM/DMARC.
- Supabase’s default email service is rate-limited and unsuitable for production.
- Customize the OTP email template with the frebies wordmark and a clear code.

### 6.7 Public pages and auth state

- Public tool pages and layouts must remain **static**.
- Do **not** call `cookies()` or `headers()` in the workbench layout or tool page server components.
- The topbar account area is a client island:
  - Renders a neutral placeholder with reserved width.
  - Hydrates the session and shows Sign in, credits and avatar.
  - Avoids layout shift.
- Main page content never depends on auth.
- Account pages can be dynamic and server-rendered.
- Dashboard can be a static shell plus client data, or dynamic and `noindex`; no SEO impact.

### 6.8 Session and sign-out

- Refresh the session on load using Supabase’s browser client.
- Sign-out clears the session and redirects to `/` or `/dashboard`.
- Never cache personalized account data in a shared cache.
- Account deletion removes the auth user, cascades database rows, and schedules storage cleanup.

### 6.9 Auth copy

Sign-in page:
> **Sign in to frebies**
> Free tools work without an account. Sign in to use AI tools, save history and get 25 free credits.
> [Continue with Google] [Email me a code]

In-tool dialog:
> **Sign in to run this upscale**
> Your file stays in this browser until you continue. New accounts get 25 free credits. This run uses 2.

---

## 7. Credits

### 7.1 Rules

- Free tools cost 0 credits and never require an account.
- AI/heavy tools cost credits per run.
- Every run button shows the exact cost before execution.
- Welcome grant: **25 credits** once per verified account.
- Credits are deducted server-side only, atomically, at run creation.
- Failed provider runs are refunded automatically.
- Insufficient balance opens upgrade/top-up; it never blocks browsing or configuring.
- Balance is shown in the topbar for signed-in users and refreshed on load and after runs.
- No realtime subscription for the balance.

### 7.2 Proposed starting costs

Marked **proposed** until confirmed in section 20.

| Tool | Cost |
|---|---|
| Image upscaler | 2 credits per image |
| Background remover | 1 credit per image |
| OCR | 1 credit per document (up to 10 pages) |
| Text to speech | 1 credit per 1,000 characters, minimum 1 |
| Speech to text | 2 credits per started minute |
| AI PDF editor | 3 credits per edit |
| Vocal remover | 4 credits per started minute |
| All browser tools | 0 |

### 7.3 Proposed plans

| Plan | Price | Credits | Notes |
|---|---|---|---|
| Free | ₹0 | 25 one-time | All free tools |
| Starter | ₹499 / month (proposed) | 300 / month | AI tools, priority |
| Pro | ₹1,499 / month (proposed) | 1,500 / month | Larger batches, priority |
| Top-up | ₹249 (proposed) | 100 | One-time purchase |

Pricing must cover provider costs with a healthy margin. Rule of thumb: the credit price for a run should be at least **3×** the worst-case provider cost. Re-check every provider price before launch.

### 7.4 MVP credit policy (simple)

- Single balance per user (`profiles.credits`).
- Welcome +25 once.
- Subscription charges **add** monthly credits; unused credits roll over while the subscription is active.
- Top-ups add credits; no expiry at MVP.
- This is deliberately simple. If liability or abuse grows, switch to expiring buckets later (plan credits expire at period end, top-ups 12 months).

### 7.5 Ledger

Every change writes an append-only `credit_ledger` row:

- `delta` (positive or negative)
- `balance_after`
- `reason`: `welcome`, `run_spend`, `run_refund`, `subscription_grant`, `topup`, `admin_adjust`
- `run_id` when applicable
- `provider_event_id` for billing
- `idempotency_key` unique
- `metadata` JSON

`profiles.credits` is the fast balance; the ledger is the audit trail. Both change in one transaction.

### 7.6 Atomic spend

A security-definer Postgres function:

```
spend_credits(user_id, cost, run_id, idempotency_key):
  lock the profile row
  if credits < cost: return insufficient
  update credits = credits - cost
  insert ledger row (delta = -cost, balance_after, reason = 'run_spend')
  return new balance
```

- Called only from the server with the service role.
- A duplicate idempotency key returns the prior result; it never charges twice.
- Refund is a separate function with key `refund:{run_id}`.
- Grants use unique provider event keys.

### 7.7 Concurrency and double-click

- The button disables after click.
- The API creates the run and spends within a transaction.
- A unique `idempotency_key` on `tool_runs` rejects duplicates.
- Two tabs submitting the same pending run produce one charge and one result.

### 7.8 Display rules

- Topbar: `23 credits`, click opens a small menu with plan, balance, upgrade and billing.
- Tool button: `Upscale · 2 credits` (signed in), `Sign in to run · 2 credits` (guest), `Merge PDF · Free` (free).
- Dashboard card: `2 credits` chip; free card: `Free` chip.
- After a run: toast “2 credits used · 23 remaining”.
- Failure: “No credits were used.”

---

## 8. Payments with Razorpay

### 8.1 Setup

- Razorpay account in INR.
- Enable international payments if a meaningful share of traffic is outside India; this may require additional activation.
- Razorpay is **not** a merchant of record. GST, invoices and tax compliance are our responsibility.
- Use separate test and live keys, and separate webhook secrets.
- Never expose `RAZORPAY_KEY_SECRET` or the webhook secret to the browser.
- Use the official Node SDK server-side only.

### 8.2 Subscription flow

1. User selects Starter or Pro in the upgrade dialog or `/pricing`.
2. Server creates a Razorpay subscription:
   - `plan_id` mapped from the plan code
   - `total_count` (for example 120 cycles)
   - `quantity: 1`
   - `customer_notify: 1`
   - notes containing `user_id` and `plan_code`
3. Server returns `subscription_id` and the public key id.
4. Client opens Razorpay Checkout with the subscription id.
5. On success, the client calls `/api/billing/confirm`.
6. Server verifies the signature and grants the first cycle idempotently.
7. The webhook confirms and grants future cycles.
8. Subscription status and period end are stored in `subscriptions`.
9. `profiles.plan_code` is updated.

### 8.3 Top-up flow

1. User selects a top-up pack.
2. Server creates a Razorpay Order in paise with notes `user_id`, `pack_code`.
3. Client opens Checkout with the order id.
4. Client calls `/api/billing/confirm`.
5. Server verifies the order signature and grants credits with key `razorpay:payment:{payment_id}`.
6. The webhook does the same with the same key; whichever arrives first wins, the other is a no-op.

### 8.4 Webhook events

Use the raw request body and the `X-Razorpay-Signature` header. Store `x-razorpay-event-id` as the primary key of `billing_events` for idempotency.

| Event | Action |
|---|---|
| `subscription.activated` | Set status active; record period |
| `subscription.charged` | Grant that cycle’s credits with a unique cycle key |
| `subscription.pending` | Mark payment pending; notify |
| `subscription.halted` | Stop recurring grants; notify |
| `subscription.cancelled` | Keep access until period end; no future grants |
| `subscription.completed` / `expired` | Mark ended; plan back to free at period end |
| `order.paid` | Grant top-up credits |
| `payment.failed` | Notify; no credits |
| `refund.created` | Record; adjust credits per refund policy |

### 8.5 Signature verification

- Subscription: HMAC SHA256 of `${payment_id}|${subscription_id}` with the key secret.
- Order: HMAC SHA256 of `${order_id}|${payment_id}` with the key secret.
- Webhook: HMAC SHA256 of the raw body with the webhook secret.
- Compare with a timing-safe function.
- Never grant credits from the browser callback alone; verification happens server-side.

### 8.6 Idempotency

- `billing_events.provider_event_id` is unique.
- Credit grants use deterministic keys:
  - `razorpay:sub:{subscription_id}:cycle:{payment_id}`
  - `razorpay:payment:{payment_id}`
- Retries and duplicate webhooks never double-grant.
- Checkout confirmation and webhooks share the same key namespace.

### 8.7 UX

- Upgrade dialog lists Free/Starter/Pro and top-ups.
- After checkout, show “Activating your plan…” until the server confirms; then refresh credits.
- Resume the pending run automatically if one exists.
- If payment fails, show a clear message and keep the input.
- Billing page shows plan, renewal date, credit balance, invoices and a cancel option.
- Cancellation: access until period end; no future grants.

### 8.8 Invoices and tax

- Decide whether displayed prices include GST.
- Collect billing details (name, address, GSTIN optional) at checkout if required.
- Generate or configure invoices.
- Keep the refund policy aligned with the credit rules.

### 8.9 Test checklist

- Test subscription activation, first charge, renewal charge, halt, cancel.
- Test a top-up order and duplicate webhook delivery.
- Test a failed payment and a refund.
- Test signature verification with wrong secrets.
- Test that a replay of the same webhook changes nothing.

---

## 9. Storage and files

### 9.1 Buckets

- `inputs` — private.
- `outputs` — private.
- No public buckets.
- Access only through short-lived signed URLs.

### 9.2 Paths

```
inputs/{user_id}/{run_id}/original.{ext}
outputs/{user_id}/{run_id}/result.{ext}
```

- UUIDs for file names; keep the original extension only after validation.
- Never trust user-provided paths.
- The server creates the path; the client receives a signed upload URL for exactly that path.

### 9.3 Upload flow

1. Client requests `/api/uploads/sign` with tool slug, file name, MIME and size.
2. Server validates auth, tool, size, MIME and rate limit.
3. Server creates a signed upload URL (`createSignedUploadUrl`).
4. Client uploads directly to Supabase Storage with `uploadToSignedUrl`.
5. Client calls `/api/runs` with the path and options.
6. Server verifies the object exists and is owned by the user.

Files are not uploaded before authentication for credit tools. Client-side free tools never upload at all.

### 9.4 Validation

- Enforce size and type on both client and server.
- Check magic bytes, not just the extension.
- Reject executables and unexpected MIME types.
- Image: max 25 MB, max 40 megapixels.
- PDF: max 25 MB, max 100 pages.
- Audio: max 50 MB, max 30 minutes.
- TTS text: max 10,000 characters per run.
- Reject empty or corrupt files with a specific error.

### 9.5 Retention and cleanup

- Inputs: delete immediately after processing where possible, otherwise within 1 hour.
- Outputs: available for 1 hour after completion.
- `tool_runs.expires_at` stores the deadline.
- A cron (`/api/cron/cleanup`) runs every 15 minutes:
  - Finds expired runs.
  - Deletes input/output objects.
  - Marks runs `expired`.
  - Cleans orphaned objects.
- Supabase Storage does not auto-expire objects by default; the cron is mandatory for the “deleted within 1 hour” promise.
- Signed download URLs expire in 1 hour.
- Account deletion removes all objects for that user.

### 9.6 Privacy copy

- Client tools: “Your file never leaves your device.”
- Server tools: “Uploaded files are processed securely and deleted within 1 hour.”
- Never claim “never stored” for server tools; say “deleted after processing / within 1 hour”.

---

## 10. Tool execution architecture

### 10.1 Engine types

| Type | Examples | Runtime | Cost | Auth |
|---|---|---|---|---|
| Browser image | Convert, compress, resize, image→PDF | Canvas / WebCodecs | Zero marginal | None |
| Browser PDF | Merge, split, PDF→JPG | pdf-lib, pdf.js | Zero marginal | None |
| Browser audio | Convert, trim | ffmpeg.wasm (lazy) | Zero marginal | None |
| Server/API paid | Upscaler, background remover, OCR, TTS, STT, AI editor | Third-party API | Per run | Credits |
| Worker (later) | Vocal remover, heavy conversions | Docker worker | Fixed + compute | Credits |

At launch, avoid anonymous server-side tools. Every server tool requires auth and credits. This removes abuse risk and server cost from free traffic.

### 10.2 Tool registry

One typed registry is the source of truth for navigation, dashboard cards, static pages, sitemap, search, related tools and SEO metadata.

```ts
type Tool = {
  slug: string;                  // "upscaler"
  category: "image" | "document" | "audio";
  path: string;                  // "/image/upscaler"
  name: string;                  // "Image Upscaler"
  h1: string;
  tagline: string;
  description: string;
  keywords: string[];
  icon: LucideIcon;
  tier: "free" | "credits";
  creditCost?: number;
  engine: "browser" | "server" | "api" | "worker";
  status: "live" | "soon";
  limits: {
    maxSizeMB: number;
    formats: string[];
    maxPages?: number;
    maxDurationMin?: number;
    maxChars?: number;
  };
  resumeBehavior: "auto" | "confirm";
  seo: {
    title: string;
    metaDescription: string;
    faq: { q: string; a: string }[];
    related: string[];
  };
  ui: {
    component: string;           // key into the tool component map
    options: string[];           // option schema keys
  };
};
```

- Registry lives in `lib/registry/tools.ts`.
- `generateStaticParams()` uses it for categories and tools.
- `dynamicParams = false`; unknown slugs 404.
- Programmatic format/size entries are generated into the same registry with `kind` metadata and a `preset` object.
- Adding a tool = one registry entry + one tool component + one engine adapter.

### 10.3 Run pipeline (paid)

1. Client validates the file locally.
2. Client requests a signed upload URL (authenticated only).
3. Client uploads the input.
4. `POST /api/runs` with tool slug, input path, options, idempotency key.
5. Server:
   - verifies the session
   - rate-limits
   - checks tool status and limits
   - verifies the input object belongs to the user
   - creates `tool_runs` row with `pending`
   - spends credits atomically
6. Calls the provider.
   - Fast tools (< ~30s): wait and return the result.
   - Long tools: return `202` with a run id; the client polls `GET /api/runs/:id` every 1.5s with backoff, up to 90s.
7. On success:
   - store the output
   - mark `succeeded`
   - set `expires_at`
   - return a signed download URL
8. On failure:
   - refund with an idempotent key
   - mark `failed` with a specific error
9. Cleanup cron deletes expired files.

No websockets. No realtime table subscriptions.

### 10.4 Why synchronous first

- Most AI provider calls return in under 30 seconds.
- No queue or worker infrastructure at launch.
- Only add a job queue/worker when provider latency or volume demands it; the `tool_runs` table already records the state needed to move to async.

### 10.5 Error codes

| Code | Meaning | Charge |
|---|---|---|
| `auth_required` | Session missing/expired | No |
| `insufficient_credits` | Balance below cost | No |
| `rate_limited` | Too many requests | No |
| `file_too_large` | Above tool limit | No |
| `unsupported_format` | MIME/extension not supported | No |
| `invalid_file` | Corrupt or unreadable | No |
| `provider_timeout` | Provider exceeded time | Refunded |
| `provider_error` | Provider returned an error | Refunded |
| `storage_error` | Output could not be saved | Refunded |
| `run_expired` | Result no longer available | No new charge |
| `idempotency_conflict` | Key reused for a different payload | No |

### 10.6 Limits and rate limits

- Free browser tools: no server limit (local processing).
- Paid runs: 10 per minute per user; 1 concurrent on Free/Starter, 3 on Pro.
- Uploads: 30 per hour per user.
- OTP: rate-limited per email and IP.
- All limits configurable server-side.

### 10.7 Provider choices (verify current pricing)

- Upscaling: Replicate Real-ESRGAN / fal.ai upscaler.
- Background removal: remove.bg or a Replicate model.
- OCR: Google Vision or OCR.space.
- TTS: ElevenLabs or OpenAI; choose voices per plan.
- STT: Whisper or Deepgram.
- AI PDF editor: LLM plus PDF text extraction/manipulation; highest complexity, phase later.
- Always add a fallback provider or a clean failure + refund path.

### 10.8 Folder structure

```
app/
  (marketing)/
    layout.tsx
    page.tsx
    pricing/page.tsx
    blog/page.tsx
    blog/[slug]/page.tsx
    about/page.tsx
    legal/[slug]/page.tsx
  (workbench)/
    layout.tsx
    dashboard/page.tsx
    [category]/page.tsx
    [category]/[tool]/page.tsx
  sign-in/page.tsx
  auth/callback/route.ts
  account/
    layout.tsx
    page.tsx
    usage/page.tsx
    billing/page.tsx
  api/
    uploads/sign/route.ts
    runs/route.ts
    runs/[id]/route.ts
    billing/checkout/route.ts
    billing/confirm/route.ts
    billing/webhook/razorpay/route.ts
    cron/cleanup/route.ts
  sitemap.ts
  robots.ts

components/
  shell/
    WorkbenchShell.tsx
    Sidebar.tsx
    Topbar.tsx
    CommandMenu.tsx
    AuthMenu.tsx
    CreditMenu.tsx
  tool/
    ToolHeader.tsx
    ToolWorkspace.tsx
    Dropzone.tsx
    OptionsRail.tsx
    RunBar.tsx
    Progress.tsx
    ResultView.tsx
    SeoContent.tsx
  billing/
    UpgradeDialog.tsx
    PlanCards.tsx
  ui/
    Button.tsx
    Dialog.tsx
    Select.tsx
    Slider.tsx
    Tabs.tsx
    Toast.tsx
    Badge.tsx

lib/
  registry/tools.ts
  registry/categories.ts
  plans.ts
  supabase/browser.ts
  supabase/server.ts
  supabase/admin.ts
  auth/return-to.ts
  credits/spend.ts
  credits/grant.ts
  credits/refund.ts
  runs/create.ts
  storage/paths.ts
  storage/cleanup.ts
  billing/razorpay.ts
  pending-run.ts
  seo/metadata.ts
  seo/schema.ts
  engines/browser/*
  engines/server/*
  tool-components.tsx

content/
  blog/*.mdx
  tools/*.ts          // long-form copy and FAQs per tool

supabase/
  migrations/
  functions/          // cleanup helpers if needed
```

---

## 11. SEO architecture

### 11.1 Reality check

- Competitive head terms (“image upscaler”) take months and backlinks.
- Long-tail pages (“compress image to 100kb”, “heic to jpg”) can rank in 1–3 months.
- Indexing happens in days to weeks; ranking is a content and authority game.
- The architecture below maximizes the chance; it cannot guarantee a timeline.

### 11.2 URL rules

- Category-first, lowercase, hyphenated: `/image/upscaler`, `/document/merge-pdf`.
- One canonical URL per tool.
- No query parameters as canonical tool pages.
- Short aliases (for example `/upscale`) may 301 later; do not duplicate.
- Never create `/dashboard/image/upscaler`; if needed, 301 to the tool URL.

### 11.3 Tool page template

1. Breadcrumb: Home / Image / Upscaler.
2. H1 matching the search intent: “Free Image Upscaler”.
3. One-line description with limits (`Upscale JPG, PNG or WebP images 2× or 4×`).
4. Cost badge and tool UI above the fold.
5. How it works — 3 steps.
6. Features and limits — formats, max size, output, privacy.
7. FAQ — 5–8 questions, visible in the HTML.
8. Related tools — 3–4 links.
9. Link to a deeper guide.
10. Last updated date.

The page must be useful without JavaScript for reading. The interactive tool can hydrate, but headings, copy and FAQs are server-rendered.

### 11.4 Metadata

Title formula: `<primary keyword> — <benefit or action> | frebies`, under ~60 characters.

Examples:

- `Free Image Upscaler — Upscale Images 2× or 4× Online`
- `Compress Image Online Free — JPG, PNG & WebP`
- `Merge PDF Files Online Free — Combine PDFs Fast`
- `Free Text to Speech — Natural AI Voices Online`

Meta description: 150–160 characters, concrete, includes the free/credits distinction and a limit.

Canonical: self-referencing absolute URL.

Open Graph/Twitter: generated per tool with name, category and cost.

`generateMetadata()` for every category and tool. No generic site title on tool pages.

### 11.5 Structured data

- `SoftwareApplication` or `WebApplication` per tool:
  - name, description, URL, applicationCategory, operatingSystem “Web”
  - offers: price 0 for free, or price range/credits for paid
- `BreadcrumbList`.
- `FAQPage` for visible FAQs.
- `Organization` + `WebSite` on the home page.
- No fake reviews or fake aggregate ratings.

### 11.6 Programmatic pages

Generate only where there is demand and unique value.

**Format pairs**

- `/image/heic-to-jpg`, `/image/webp-to-png`, `/audio/wav-to-mp3`, etc.
- Only pairs the engine actually supports.
- Unique copy per pair: format comparison, compatibility, file-size notes, 4–6 FAQs.
- Preset the converter UI with the selected formats.

**Size targets**

- `/image/compress-to-100kb`, `...-200kb`, `...-500kb`, `...-1mb`.
- High intent; add preset buttons, expected quality notes and FAQs.

**Use cases**

- Passport photo, government form upload limits, YouTube thumbnail, podcast audio cleanup.
- Publish only when the tool genuinely satisfies the use case.

**Quality gate**

A programmatic page is indexed only if it has:

- a working tool,
- 300+ words of unique, useful copy,
- a unique title/H1,
- at least 4 FAQs,
- internal links from a hub or guide,
- and evidence of demand (keyword tool data).

Otherwise do not generate it, or mark it `noindex`.

Avoid generating every possible format combination. Curate the high-demand list.

### 11.7 Internal linking

- Sidebar links to categories and tools (crawlable `<a>` elements).
- Category hubs link to every live tool in that category.
- Tool pages link to 3–4 related tools and one guide.
- Blog posts link to tools with descriptive anchors.
- Breadcrumbs everywhere.
- Sitemap catches anything not linked directly.
- Keep the sidebar organized; for a very large catalog, use collapsible groups instead of hundreds of flat links.

### 11.8 Sitemap and robots

- `/sitemap.xml` index.
- `/sitemaps/tools.xml` — tool pages, hubs, programmatic pages.
- `/sitemaps/blog.xml` — posts.
- Exclude `/dashboard`, `/account/*`, `/sign-in`, `/auth/*`, `/api/*`.
- `robots.ts` disallows account/auth/API, allows the rest.
- Submit to Google Search Console and Bing Webmaster Tools.
- Update `lastModified` when content changes.
- Use 301s for URL changes; never soft-404.

### 11.9 Performance budgets

- LCP < 2.0s on a tool page.
- Initial JS < 120 KB gzipped.
- CLS < 0.05.
- INP < 200ms.
- Heavy libraries (ffmpeg.wasm, upscaler SDK) load only after a user action, with a progress state.
- Server-render the tool frame, H1 and SEO copy.
- Self-host fonts with `next/font`.
- Avoid auth flicker: reserve the topbar account slot and the lock icon slot.

### 11.10 Content clusters

- **Image:** upscaler guide, compress guide, HEIC vs JPG, WebP vs PNG, image size for forms.
- **Documents:** merge/split guides, PDF compression, OCR use cases, PDF vs Word.
- **Audio:** TTS voices, WAV vs MP3, podcast cleanup, transcription formats.
- **Comparisons:** “frebies vs X” only if honest and useful.
- 2–4 high-quality pieces per month beats daily thin posts.

### 11.11 Launch SEO checklist

- [ ] Every live tool has a unique title, description, H1 and canonical.
- [ ] Tool page HTML contains the full copy and FAQ without JS.
- [ ] Sitemap includes all public tools and hubs, excludes app pages.
- [ ] robots.txt correct.
- [ ] JSON-LD validates.
- [ ] Internal links from hubs and related tools.
- [ ] No login wall on any indexed page.
- [ ] Auth state does not alter main content.
- [ ] Core Web Vitals checked on mobile.
- [ ] Search Console and Bing verified.
- [ ] 404s return 404, redirects are 301.
- [ ] OG images render per tool.
- [ ] No duplicate tool URLs.

### 11.12 Anti-patterns

- Sending all search traffic to `/dashboard`.
- Indexing thin format pages with swapped names only.
- Hiding tool content behind login.
- Showing different copy to Googlebot than users.
- Keyword-stuffed sidebars.
- Fake “free” claims with a surprise paywall.
- Auto-generating thousands of pages without demand.

---

## 12. Design system

The visual reference is the two ElevenLabs screenshots: white canvas, a light gray rail, hairline borders, small precise type, minimal color, and a compact topbar.

### 12.1 Visual DNA

- Structure comes from **1px borders**, not shadows.
- Color occupies under 2% of the screen.
- UI text is small: 13px base.
- Corners are 8–12px, not 24–28px.
- Icons are thin Lucide line icons.
- Density is high but the page feels airy through whitespace and grouping.
- No gradients or grain in the workbench.

### 12.2 Color tokens

Sampled and normalized from the references. Secondary and faint grays were darkened from the sampled values so small text meets WCAG AA on white and `#FAFAFA`.

| Token | Value | Use |
|---|---|---|
| Canvas | `#FFFFFF` | Main content |
| Rail | `#FAFAFA` | Sidebar |
| Hover | `#F3F3F2` | Rows, cards |
| Active | `#EFEFEF` | Active sidebar row |
| Border | `#ECECEA` | Cards, inputs |
| Soft border | `#F1F1F1` | Topbar, inner dividers |
| Ink | `#0F0F10` | Text, primary buttons |
| Secondary | `#5F5F5F` | Descriptions, inactive nav |
| Faint | `#6F6F6F` | Labels, placeholders |
| Accent | `#E55E40` | Focus ring, active option outline |
| Chart | `#FF4B4B` | Activity line |
| Chart fill | `#FFF2F2` | Area fill |
| Promo amber | `#FDA82B` | Small promo icon |
| Promo green | `#0F6B57` → `#7A9D94` | Illustration gradient only |

Additional:

- Success: muted green, never neon.
- Error: `#C93A3A`; use the accent family sparingly.
- Focus ring: 2px `#E55E40`, offset 2px.

### 12.3 Typography

- **Inter Tight** for display headings.
- **Inter** for UI and body.
- `font-feature-settings: "tnum" 1` on metrics and credit numbers.

| Role | Font | Size / line | Weight | Tracking |
|---|---|---|---|---|
| Marketing H1 | Inter Tight | clamp(36px, 5vw, 56px) / 1.05 | 600 | -0.035em |
| App/tool H1 | Inter Tight | 28px / 34px | 600 | -0.02em |
| Section title | Inter | 15px / 22px | 600 | -0.01em |
| Body | Inter | 14px / 22px | 400 | 0 |
| UI / button | Inter | 13px / 18px | 500 | 0 |
| Micro / label | Inter | 11.5px / 16px | 500 | 0.01em |
| Metric | Inter | 24px / 30px | 600 | -0.02em |
| Marketing body | Inter | 16px / 26px | 400 | -0.005em |

### 12.4 Layout metrics

- Sidebar: **264px**, fixed, white/`#FAFAFA`, 1px right border; collapses to a **72px** icon rail from the topbar.
- Topbar: **56px**, sticky, white, 1px bottom border `#F1F1F1`.
- Content max width: **1280px**, page padding **36px** desktop, **20px** mobile.
- Sidebar nav row: **36px**, inset 10px, radius 8px, custom icon 19px, gap 12px, 13.5px label.
- Scrollbars are visually hidden across the product, except the fixed-height studio settings rails, which keep a faint thumb that darkens on hover so their internal scroll is discoverable. All scroll regions remain keyboard- and wheel-accessible.
- Section label: 11.5px, `#9A9A9A`, 20px top margin.
- Settings rail: **360px**, left hairline, 24px padding.
- Cards: radius **12px**, 1px border `#ECECEA`, 20px padding.
- Controls: 32–36px tall, radius 8–10px.
- Modals: 480px wide, radius 16px, 24px padding, overlay `rgba(15,15,16,0.4)`.
- Shadows: none on cards; overlays only.
- Motion: 120–160ms ease-out, hover and state changes only.

### 12.5 Shell

```
┌──────────────────────────────────────────────────────────────┐
│ logo      │ ◧  Image › Upscaler     [Search ⌘K]      credits  │ 56px
├───────────┼──────────────────────────────────────────────────┤
│ Home      │  Image Upscaler                 [Free / 2 cr]    │
│ All tools │  ┌────────────────────────────────────────────┐  │
│           │  │         Drop or choose an image            │  │
│ DOCUMENTS │  │      JPG · PNG · WebP · up to 25 MB        │  │
│  Merge    │  └────────────────────────────────────────────┘  │
│  Split    │  How it works · FAQ · Related tools              │
│ IMAGES    │                                                  │
│  Upscaler │                                                  │
│ AUDIO     │                                                  │
│           │                                                  │
│ [credits] │                                                  │
└───────────┴──────────────────────────────────────────────────┘
  264px                    max 1280, px 36
```

Sidebar structure:

- Logo block, 56px.
- Home / All tools.
- Group labels: Documents, Images, Audio, with every registry tool linked beneath.
- Bottom: plan/credits card for signed-in users; a subtle “Get 25 free credits” prompt for guests.
- Active row: `#EFEFEF`, ink text and icon.
- Paid tools: subtle custom lock glyph for guests (section 12.6).
- Desktop collapse control in the topbar changes the rail to 72px; the compact rail keeps every tool accessible by icon, with native titles and ARIA labels.
- Sidebar and tool glyphs use a hand-tuned 24px outline set with 1.6px rounded strokes instead of stock icon-library symbols.

Topbar:

- Left: mobile drawer toggle, desktop sidebar collapse control, breadcrumb.
- Center: soft-gradient search field, 300–340px, 36px tall, `⌘K` chips.
- Right: credits pill (signed in), Sign in/avatar, optional Help link.
- No “Log in” on marketing pages.

### 12.6 Lock icon

- Guest-only, for credit tools.
- 12px custom lock glyph, aligned to the trailing edge, color `#9A9A9A` (ink when active).
- Tooltip: “Uses credits — sign in to run”.
- `aria-label` on the item.
- Reserve a 14px trailing slot so auth hydration does not shift the layout.
- Signed-in users: no lock; show a small cost chip on dashboard cards and the tool header.
- Free tools: never show a lock.
- The lock never disables navigation or the page.

### 12.7 Components

| Component | Specification |
|---|---|
| Primary button | Near-black vertical gradient, white text, 32–36px tall, 13px medium, radius 9px, inset top highlight and 1px resting shadow |
| Secondary button | White-to-warm-white gradient, 1px `#E4E4E0`, inset light edge, radius 9px, soft hover border |
| Ghost button | Transparent, hover `#F3F3F2` |
| Topbar actions | Secondary “Get credits” action and primary “Sign in”; passive environment labels are not shown |
| Input / select | 36px, 1px border, radius 8px, 13px; focus ring accent |
| Slider | 4px track `#ECECEA`, fill ink, 12px thumb, 11px end labels |
| Tabs | 14px, active ink with 2px underline, inactive secondary |
| Card | 12px radius, 1px border, 20px padding, no shadow |
| Badge | 11px, 20px tall, `Free` = bordered chip; credits = `2 credits` with coral dot |
| Dropzone | 240px tall, dashed `#DCDCDA`, near-white bg, 13px helper |
| Progress | 4px determinate bar; percentage and status text |
| Toast | Bottom-right on desktop, bottom on mobile, 4s |
| Dialog | 480px, radius 16px, focus trap, ESC to close |
| Chart | 2px coral line, 10% fill, horizontal grid `#F2F2F0`, 11px labels |
| Empty state | Centered icon, 14px heading, 13px secondary, optional action |

### 12.8 Page specs

**Landing `/`**

- 56px top nav: logo, Image / Documents / Audio / Pricing, search, black **Get started**.
- No login button.
- Hero: headline 36–56px, subcopy 16px, CTAs “Get started” → `/dashboard`, “Browse tools” → category directory.
- Three category blocks with tool links and Free/Credits badges.
- A real product panel preview, not decorative gradient orbs.
- Trust row: “No sign-up for free tools”, “Files deleted after processing”, “No watermarks”.
- Pricing summary, FAQ, footer.
- Remove the marquee and film grain from the public identity; keep the brand mark and a single coral accent.

**Dashboard `/dashboard` (noindex)**

- H1 “Dashboard”, 28px.
- Guest note: “Free tools work without an account. Sign in for 25 free credits.” with a Sign in button.
- Signed in: credit card with balance, plan and upgrade; runs this month; plan status.
- Category tabs / filter (All, Images, Documents, Audio), client-side.
- Tool grid: icon, name, one-line description, Free or cost chip.
- Quick links: pricing, how credits work, all tools.
- Optional small activity chart; no realtime.
- No forced modal on arrival.

**Category hub `/[category]`**

- H1 “Image tools” etc., short intro, tool grid, related guides, FAQ.
- Full SEO content; indexed.

**Tool page `/[category]/[tool]`**

- Breadcrumb, H1, tagline, cost chip.
- Tool panel: dropzone or editor; right options rail for multi-option tools; single card for simple tools.
- Run button shows exact cost and auth state.
- Result view with preview and download.
- Below: How it works, features/limits, FAQ, related tools, guide link, last updated.
- Mobile: options collapse below the tool; sticky run bar at the bottom.

**Sign-in `/sign-in`**

- 380px centered card.
- Google button, email OTP form, terms note, back link.
- `next` preserved; no sidebar.
- `noindex`.

**Pricing `/pricing`**

- Free / Starter / Pro cards + top-up.
- Credits explainer: what a credit buys, welcome credits, refunds.
- FAQ.
- CTA to sign in/upgrade.
- INR amounts.

**Account**

- Profile, plan, balance.
- Usage: ledger and runs.
- Billing: plan, renewal, invoices, cancel.
- Protected; noindex.

### 12.9 Responsive

- Sidebar becomes a drawer under 1024px; hamburger in the topbar.
- Search collapses to an icon; command palette on tap.
- Tool options stack below the tool under 1024px.
- Sticky run bar on mobile with the cost and button.
- Inputs are 16px on mobile to prevent iOS zoom.
- Touch targets at least 44px.
- Lock icon remains visible in the mobile drawer.

### 12.10 Accessibility

- Keyboard-operable dropzone (button + hidden file input).
- Dialogs: focus trap, ESC, labelled by title.
- `aria-live` for processing status, success and errors.
- Visible labels for sliders and selects.
- Contrast 4.5:1 for body text.
- Focus ring 2px accent, offset 2px.
- Respect `prefers-reduced-motion`; no workbench entrance animations.
- Error messages linked with `aria-describedby`.

### 12.11 Current landing migration

- Remove the `Log in` link from the marketing navbar.
- Point “Get started” to `/dashboard`.
- Replace cream `#fbfbfa` canvas and film grain with white and hairline borders in the workbench.
- Retire oversized 28px radii and gradient orbs from app surfaces; landing may keep one restrained visual.
- Update copy claims to match reality:
  - “256+ conversions” only if true.
  - `$9` becomes an INR price.
  - “10,000 credits” is not a real plan.
  - “Deleted within an hour” requires the cleanup cron.
- Keep `framer-motion` for marketing only; use CSS transitions for workbench controls.

### 12.12 Copy rules

- Buttons: `Upscale · 2 credits`, `Sign in to run · 2 credits`, `Merge PDF · Free`.
- Guest lock tooltip: `Uses credits — sign in to run`.
- Welcome: `New accounts get 25 free credits.`
- Retention: `Files are deleted within 1 hour.`
- Failure: `No credits were used.`
- Never say “unlimited” unless it is enforced as unlimited.
- Show limits next to the tool, not in fine print.

---

## 13. Tool catalog and build phases

### 13.1 Launch catalog

| Category | Tool | URL | Tier | Cost | Engine | Phase |
|---|---|---|---|---|---|---|
| Image | Converter | `/image/convert` | Free | 0 | Browser | 1 |
| Image | Compressor | `/image/compress` | Free | 0 | Browser | 1 |
| Image | Resize / crop | `/image/resize` | Free | 0 | Browser | 1 |
| Image | Image to PDF | `/image/to-pdf` | Free | 0 | Browser | 1 |
| Document | Merge PDF | `/document/merge-pdf` | Free | 0 | Browser | 1 |
| Document | Split PDF | `/document/split-pdf` | Free | 0 | Browser | 1 |
| Document | PDF to JPG | `/document/pdf-to-jpg` | Free | 0 | Browser | 2 |
| Audio | Audio converter | `/audio/convert` | Free | 0 | Browser | 2 |
| Audio | Audio trimmer | `/audio/trim` | Free | 0 | Browser | 2 |
| Image | Upscaler | `/image/upscaler` | Credits | 2 | API | 2 |
| Document | OCR | `/document/ocr` | Credits | 1 | API | 3 |
| Image | Background remover | `/image/remove-background` | Credits | 1 | API | 3 |
| Audio | Text to speech | `/audio/text-to-speech` | Credits | 1 / 1k chars | API | 3 |
| Document | AI PDF editor | `/document/ai-editor` | Credits | 3 | API + LLM | 4 |
| Audio | Speech to text | `/audio/speech-to-text` | Credits | 2 / min | API | 4 |
| Audio | Vocal remover | `/audio/vocal-remover` | Credits | 4 / min | Worker | 4 |

Notes:

- HEIC decoding is inconsistent in browsers. Either add a WASM decoder or route HEIC through a server tool before publishing `/image/heic-to-jpg`. Do not claim HEIC until it works.
- PDF compression needs a server engine (Ghostscript) or a provider; do not list it as free browser compression.
- Start with tools that need no server infrastructure.

### 13.2 Programmatic page list

Curate from real demand; examples:

- `/image/heic-to-jpg` (only when supported)
- `/image/webp-to-png`
- `/image/jpg-to-webp`
- `/image/compress-to-100kb`
- `/image/compress-to-200kb`
- `/image/compress-to-500kb`
- `/audio/wav-to-mp3`
- `/audio/m4a-to-mp3`
- `/document/pdf-to-jpg` (the real tool can double as the landing page)

Each page reuses a live engine with a preset and adds unique copy and FAQs.

### 13.3 Build phases

| Phase | Scope | Acceptance | Effort |
|---|---|---|---|
| 0 Foundation | Upgrade Next; design tokens; middleware-free static workbench shell; sidebar/topbar; registry; category/tool routing; SEO metadata helpers; Supabase project; env setup; analytics | Shell responsive; registry generates nav and cards; one sample static tool page; Lighthouse baseline; no auth yet | 4–6 days |
| 1 Free MVP | Landing retheme; dashboard directory; 3 category hubs; 6 free browser tools; tool template + SEO content; sitemap/robots; PostHog | All free tools work without auth; pages indexable; sitemap validates; mobile works | 2–3 weeks |
| 2 Accounts + credits | Supabase auth (Google + OTP); profiles; welcome credits; pending-run restore; sign-in page; account usage; upscaler; lock icons; credit spend/refund | Guest fills upscaler, signs in by Google and OTP, runs exactly once; balance correct; no double charge | 2 weeks |
| 3 Billing | Razorpay subscriptions + top-ups; checkout; confirm; webhooks; upgrade dialog; billing page; resume after upgrade | Test subscription and top-up grant credits once; duplicate webhooks are idempotent; cancel/halt handled | 1–2 weeks |
| 4 SEO scale | Programmatic format/size pages; guides; schema; internal linking; GSC; more paid tools | N quality pages indexed; no thin/duplicate pages; related links live | 2–4 weeks, ongoing |
| 5 Hardening | Rate limits; security review; a11y; performance; error monitoring; storage cleanup verification; account deletion | Budgets met; alerts working; retention verified end to end | Ongoing |

**Timeline:** roughly 6–8 weeks solo for a functional MVP. Free tools can ship in Phase 1 before accounts exist, which starts indexing early. SEO results are a 3–12 month effort.

---

## 14. Data model

All tables in `public` unless stated. Use UUID primary keys unless noted.

### 14.1 `profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | References `auth.users(id)` on delete cascade |
| `email` | text | Synced from auth |
| `full_name` | text | Optional |
| `avatar_url` | text | Optional |
| `plan_code` | text | `free`, `starter`, `pro` |
| `credits` | integer | Non-negative balance |
| `welcome_granted_at` | timestamptz | Null until granted |
| `razorpay_customer_id` | text | Optional |
| `created_at` / `updated_at` | timestamptz | |

### 14.2 `credit_ledger`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | FK profiles |
| `delta` | integer | Positive or negative |
| `balance_after` | integer | |
| `reason` | text | welcome, run_spend, run_refund, subscription_grant, topup, admin_adjust |
| `run_id` | uuid | Nullable |
| `provider_event_id` | text | Razorpay event or payment |
| `idempotency_key` | text | **Unique** |
| `metadata` | jsonb | |
| `created_at` | timestamptz | |

### 14.3 `tool_runs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | Nullable only if anonymous server runs exist; launch requires auth |
| `tool_slug` | text | Registry slug |
| `status` | text | pending, processing, succeeded, failed, expired |
| `credit_cost` | integer | 0 for free |
| `idempotency_key` | text | **Unique** |
| `input_path` | text | Storage path |
| `input_meta` | jsonb | Name, size, MIME, pages, duration; no content |
| `output_path` | text | |
| `provider` | text | |
| `provider_job_id` | text | |
| `error_code` | text | |
| `created_at` / `started_at` / `completed_at` | timestamptz | |
| `expires_at` | timestamptz | File retention deadline |

Indexes: `user_id, created_at desc`; `status`; `expires_at`; unique `idempotency_key`.

### 14.4 `subscriptions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `provider` | text | `razorpay` |
| `provider_subscription_id` | text | Unique |
| `provider_plan_id` | text | |
| `plan_code` | text | |
| `status` | text | created, active, pending, halted, cancelled, completed, expired |
| `current_period_end` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

### 14.5 `billing_events`

| Column | Type | Notes |
|---|---|---|
| `provider_event_id` | text PK | Razorpay event id header |
| `event_type` | text | |
| `payload` | jsonb | |
| `processed_at` | timestamptz | |

### 14.6 `anonymous_usage` (only if not using Upstash)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `ip_hash` | text | Never store raw IP |
| `tool_slug` | text | |
| `day` | date | |
| `count` | integer | |

### 14.7 RLS

- `profiles`: select own row; no client updates to `credits`, `plan_code`, `welcome_granted_at`.
- `credit_ledger`: select own; no client inserts.
- `tool_runs`: select own; no client inserts/updates.
- `subscriptions`: select own; no client writes.
- `billing_events`: no client access.
- Storage: users can read their own objects only through signed URLs; no public policies.
- Service role bypasses RLS for server operations.

### 14.8 SQL functions

- `spend_credits(user_id, cost, run_id, idempotency_key)`
- `refund_credits(user_id, amount, run_id)`
- `grant_credits(user_id, amount, reason, idempotency_key, metadata)`
- `handle_new_user()` — trigger creates profile and welcome grant.
- All are `security definer`, set an explicit `search_path`, and are executable only by the service role.
- Use row locks (`select ... for update`) and insert the ledger row in the same transaction.
- Enforce `credits >= 0`.

### 14.9 Migrations

- Use Supabase CLI migrations in `supabase/migrations`.
- Seed plans in code (`lib/plans.ts`), not in the database, at MVP.
- Add indexes before launch.
- Test RLS with anon and authenticated roles.

---

## 15. API surface

### 15.1 Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/uploads/sign` | Required | Create a signed upload URL |
| POST | `/api/runs` | Required | Create/spend/execute a run |
| GET | `/api/runs/[id]` | Required | Poll status, get result URL |
| POST | `/api/billing/checkout` | Required | Create Razorpay subscription/order |
| POST | `/api/billing/confirm` | Required | Verify checkout signature, grant credits |
| POST | `/api/billing/webhook/razorpay` | Signature | Process Razorpay webhooks |
| POST | `/api/cron/cleanup` | CRON_SECRET | Delete expired files |
| GET | `/api/health` | None | Basic deployment health |

Client reads `profiles` and `tool_runs` directly through Supabase RLS where convenient, but writes always go through the API. If a direct read is used, never trust it for authorization decisions.

### 15.2 Run contract

Request:

```json
{
  "toolSlug": "image/upscaler",
  "inputPath": "inputs/8f5.../run-123/original.png",
  "options": { "scale": 4, "format": "png" },
  "idempotencyKey": "1b4e28ba-2fa1-11d2-883f-0016d3cca427"
}
```

Response (sync success or async accepted):

```json
{
  "runId": "c1f0...",
  "status": "pending",
  "creditCost": 2
}
```

`GET /api/runs/:id`:

```json
{
  "runId": "c1f0...",
  "status": "succeeded",
  "resultUrl": "https://...signed...",
  "expiresAt": "2026-10-29T12:00:00Z",
  "error": null
}
```

Rules:

- Verify the run belongs to the caller.
- Never return another user’s paths.
- Signed URLs expire in 1 hour.
- A duplicate idempotency key returns the original run with the same ownership.

### 15.3 Upload contract

Request:

```json
{
  "toolSlug": "image/upscaler",
  "fileName": "photo.png",
  "mime": "image/png",
  "size": 2483910
}
```

Response:

```json
{
  "path": "inputs/8f5.../run-123/original.png",
  "token": "signed-upload-token",
  "signedUrl": "https://..."
}
```

Validate tool, type, size, auth and rate limit before signing.

### 15.4 Billing contracts

Checkout:

```json
{ "kind": "subscription", "planCode": "starter" }
```

or

```json
{ "kind": "topup", "packCode": "credits_100" }
```

Response contains the public key and `subscriptionId` or `orderId` for Razorpay Checkout.

Confirm:

```json
{
  "razorpay_payment_id": "pay_...",
  "razorpay_subscription_id": "sub_...",
  "razorpay_signature": "..."
}
```

or the order equivalents. Verify server-side, grant idempotently, return plan and balance.

Webhook:

- Raw body, no JSON parsing before signature verification.
- Verify `X-Razorpay-Signature`.
- Store `x-razorpay-event-id`.
- Return 200 for handled and duplicate events; 400 for invalid signatures.

### 15.5 Error response shape

```json
{
  "error": {
    "code": "insufficient_credits",
    "message": "You need 2 credits and have 1.",
    "details": { "required": 2, "balance": 1 }
  }
}
```

---

## 16. Security, privacy and legal

### 16.1 Security checklist

- Verify the Supabase session on every protected API call; never trust a `user_id` from the client.
- Use the service role only on the server; never expose it through `NEXT_PUBLIC_*`.
- Credits are changed only through security-definer functions.
- Validate uploads: size, MIME, magic bytes, extension, ownership.
- Private storage buckets; signed URLs; no directory listing.
- Rate limit auth, uploads, runs and billing endpoints.
- Verify Razorpay signatures; store and deduplicate event ids.
- Validate `next`/`returnTo` to prevent open redirects.
- Use SameSite cookies; verify origin on sensitive POSTs.
- Avoid `dangerouslySetInnerHTML` with user content; sanitize any AI output rendered as HTML.
- No arbitrary URL fetching (SSRF). If URL import is added later, block private IP ranges.
- Hash IPs before storing; never log file contents or full names.
- Add security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy).
- Dependency updates and secret rotation.

### 16.2 Abuse prevention

- Welcome credits require a verified email (Google or OTP).
- Monitor multiple accounts from one IP hash/device.
- Rate limit OTP sends and verification attempts.
- Require auth for every server tool; no anonymous server processing at launch.
- Cap uploads and concurrent runs.
- Refund only provider failures, not user abuse.
- Suspend accounts with chargebacks or repeated abuse.

### 16.3 Privacy

- Client tools: files never leave the browser.
- Server tools: private storage, short retention, no training on user files.
- Publish a clear retention table:
  - Inputs deleted after processing or within 1 hour.
  - Outputs available for 1 hour.
  - Metadata retained for usage history; no file content.
- Account deletion: remove auth user, cascade database, delete storage objects.
- Cookie policy for analytics and auth.
- Data processing notes for any AI provider used; ideally choose providers that do not train on API data.

### 16.4 Legal pages

- Terms of service.
- Privacy policy.
- Cookie policy.
- Refund and cancellation policy (credits, subscriptions).
- Acceptable use (no illegal content, no malware, no abuse).
- Contact and grievance details.
- GST/business details where required.

---

## 17. Analytics and monitoring

### 17.1 Events

- `page_view` (marketing and tool pages, with path and referrer)
- `tool_view` (tool slug, tier, auth state)
- `file_selected` (tool, size bucket, type)
- `run_clicked` (tool, cost)
- `auth_gate_shown` (tool, cost)
- `signin_started` / `signin_completed` (method, return tool)
- `pending_run_restored` (tool, success/failure)
- `run_started` / `run_succeeded` / `run_failed` (tool, cost, duration, error code)
- `download_clicked`
- `upgrade_modal_shown` / `checkout_started` / `checkout_completed`
- `credits_granted` / `credit_spend`

Include tool, category, auth state, cost and UTM/source where relevant.

### 17.2 KPIs

- Tool page visits → run start rate.
- Guest run → sign-in conversion on paid tools.
- Sign-in → first paid run conversion.
- Free tool usage and return usage.
- Credit burn per tool and provider cost per run.
- Upgrade conversion and churn.
- SEO impressions, clicks, CTR and average position per tool page.
- Indexed page count and crawl errors.
- Core Web Vitals.

### 17.3 Monitoring

- Sentry for client/server errors.
- Alerts for provider error rate > 5%, webhook failures, refund spikes, storage cleanup failures, 5xx spikes.
- Uptime check on the home page and one tool page.
- Daily review of failed runs and credit refunds.

---

## 18. Environment and deployment

### 18.1 Environment variables

```
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
RAZORPAY_PLAN_STARTER
RAZORPAY_PLAN_PRO
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
RESEND_API_KEY
AI provider keys (Replicate/fal, TTS, STT, OCR)
CRON_SECRET
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_POSTHOG_HOST
SENTRY_DSN
```

Rules:

- Only `NEXT_PUBLIC_*` values reach the browser.
- Never commit `.env` files.
- Use separate Supabase projects and Razorpay keys for staging and production.
- Rotate secrets on team changes.

### 18.2 Deployment

- Vercel for the Next.js app and API routes.
- Supabase for Postgres, Auth and Storage.
- Vercel Cron for cleanup (every 15 minutes) and optionally sitemap pings.
- Razorpay webhooks point to the production and staging URLs with different secrets.
- Custom domain with apex + `www` redirect; one canonical host.
- Preview deployments are `noindex` and must not send real OTP/billing emails or use live Razorpay keys.

### 18.3 Backups

- Enable Supabase backups/PITR where available.
- Export a schema snapshot with migrations.
- Document restore steps.
- Do not rely on storage files as backups; they are temporary by design.

---

## 19. Current codebase and migration notes

Current scaffold:

- [app/page.tsx](file:///C:/Users/Ayush%20Kumar/Documents/frebies/app/page.tsx) composes a single marketing page.
- [components/Navbar.tsx](file:///C:/Users/Ayush%20Kumar/Documents/frebies/components/Navbar.tsx) contains the current `Log in` link (line ~47) and `Get started` (line ~48).
- [components/Hero.tsx](file:///C:/Users/Ayush%20Kumar/Documents/frebies/components/Hero.tsx) contains the main CTA.
- [components/Sections.tsx](file:///C:/Users/Ayush%20Kumar/Documents/frebies/components/Sections.tsx) contains tools, pricing and privacy sections.
- [components/ui.tsx](file:///C:/Users/Ayush%20Kumar/Documents/frebies/components/ui.tsx) holds buttons, orbs and motion primitives.
- [app/globals.css](file:///C:/Users/Ayush%20Kumar/Documents/frebies/app/globals.css) sets the cream canvas and grain.
- [tailwind.config.js](file:///C:/Users/Ayush%20Kumar/Documents/frebies/tailwind.config.js) holds the current color tokens.
- [app/layout.tsx](file:///C:/Users/Ayush%20Kumar/Documents/frebies/app/layout.tsx) has metadata and the Inter font.

Required changes:

1. Remove `Log in` from the marketing navbar; keep only **Get started** → `/dashboard`.
2. Retarget the hero CTA to `/dashboard`.
3. Add the `(marketing)` and `(workbench)` route groups.
4. Introduce the white/hairline design tokens; retire cream/grain from workbench surfaces.
5. Reduce radii from 28px to 12px on cards; change pill buttons to 8px controls in the workbench.
6. Build the registry and generate navigation, pages and sitemap.
7. Add Supabase, Razorpay, `idb-keyval`, validation and analytics dependencies.
8. Upgrade Next.js to the current stable version before Phase 1; verify React compatibility.
9. Fix placeholder claims: “256+ conversions”, `$9`, “10,000 credits”, “deleted within an hour”.
10. Replace the current `Motion` wrapper usage on workbench pages with CSS transitions; keep motion for marketing.

No backend exists yet. There is no git repository initialized in the workspace; initialize one before implementation.

---

## 20. Open decisions

These are not blockers for Phase 0, but must be settled before the relevant phase.

1. **INR pricing and credit amounts.** Proposed: ₹499 Starter / ₹1,499 Pro / ₹249 top-up; confirm.
2. **Per-tool credit costs.** Proposed in section 7.2; validate against provider invoices.
3. **Auto-run threshold.** Proposed: auto-run ≤ 5 credits; confirm for expensive audio.
4. **File retention.** Proposed: inputs deleted after processing or within 1 hour; outputs 1 hour.
5. **Refund policy.** Provider failure auto-refund; user cancellation after processing starts is not refunded. Confirm.
6. **Launch catalog.** Six free tools in Phase 1; confirm HEIC and PDF compression timing.
7. **AI providers.** Upscaler, background removal, OCR, TTS, STT; confirm budget and fallbacks.
8. **Email sender/domain.** Required for OTP deliverability.
9. **Account deletion and data export policy.**
10. **Brand mark.** Keep the current orange accent or move to a monochrome mark with a coral dot.

---

## 21. Decision log

| Date | Decision |
|---|---|
| 2026-10-29 | Confirmed Supabase for auth, Postgres and storage; Razorpay for payments. |
| 2026-10-29 | Confirmed one public URL per tool, shared workbench shell, dashboard as a `noindex` directory. |
| 2026-10-29 | Confirmed deferred authentication for credit tools, with pending input restored after sign-in and auto-run. |
| 2026-10-29 | Confirmed small guest-only lock icon next to credit tools; page remains fully open. |
| 2026-10-29 | Confirmed Google OAuth + 6-digit email OTP (not magic links) to preserve pending state. |
| 2026-10-29 | Confirmed visual direction based on ElevenLabs references: white canvas, gray rail, hairline borders, 13px UI, minimal color. |
| 2026-10-29 | Phase 0 implemented: Next 16.4.3, workbench shell, registry, dashboard, category hubs, `/image/convert`, sitemap/robots, JSON-LD, custom 404. Muted grays darkened for WCAG AA. |
| 2026-10-29 | Visual-system pass completed: richer dashboard composer, filters, tool cards, category showcases, responsive layouts and a rethemed landing, sign-in and 404. |
| 2026-10-29 | All 16 registry tools now render static, tool-specific UI previews and have canonical URLs in the sitemap. Processing controls and final actions are visibly disabled until their engines are connected. `status` now describes engine readiness, not whether the UI route exists. |
| 2026-10-29 | Navigation refined around a 264px rail using a custom 24px rounded-outline icon set, softer 13.5px labels and a 56px topbar. Added a desktop 72px icon-only rail controlled from the topbar; it stays collapsed across client navigation but resets on a fresh load. All scrollbars are hidden globally while scrolling remains available. |
| 2026-10-29 | Topbar upgraded with a very subtle white gradient/inset highlight, soft-gradient search field, custom search/menu/arrow glyphs and glossy 9px buttons. Replaced the passive “Free workspace” status with a genuine “Get credits” action and made Sign in the primary action. |
| 2026-10-29 | Marketing landing restored to the previous warm editorial direction — oversized headline, animated orb carousel, high-radius cards, marquee and large footer. The newer browser-frame workbench mock is retained as a dedicated workspace section. Placeholder format claims, old pricing and dead marketing links were replaced with the actual 16-tool catalog and current free/credit model. |
| 2026-10-29 | Dashboard elevated beyond the flat pass: warm editorial hero with a live tool launcher, layered workspace illustration, expressive category cards, custom glyphs in the tool directory, and a split credits/recent-work ending. The functional list/grid directory remains; mobile filters collapse to concise labels. |
| 2026-10-29 | Image compressor rebuilt as a dedicated studio: quality, percentage and exact final-size goals, presets for web/email/marketplace/max savings, batch handling for up to 10 images with per-file estimates, output format/resize/advanced controls, and a live size ladder with savings. The compressor page now has its own hero and full SEO content (8 FAQs). The browser encoder is still pending, so the route keeps `status: "soon"` and the UI labels itself as a preview. |
| 2026-10-29 | Batch conversion added to the image converter (up to 10 images, per-file thumbnails, replace/remove/clear, one output each). Both the converter and compressor now use a fixed-height settings rail that scrolls independently on desktop; the rail shows a faint, hover-darkening scrollbar so the affordance is visible. Image-to-PDF and Resize & Crop received dedicated heroes and studios with page setup/crop controls, and both have full SEO copy. |
| 2026-10-29 | Resize & Crop gained a pointer-driven crop canvas: drag to move, eight free-form handles or four ratio-locked corners, keyboard nudging, live pixel size, reset, and rotation applied after the crop. Image Upscaler and Background Remover were rebuilt as premium paid studios — a dark AI lab with an inspect loupe for upscaling, and a checkerboard cutout studio for background removal — each with a fixed run footer, credit chips, a sign-in credit gate and full SEO copy. |
| 2026-10-29 | Supabase project keys, Razorpay, analytics, actual tool engines and the React 19 upgrade remain pending. |

---

*End of plan. This file is the source of truth; update it whenever a decision changes.*
