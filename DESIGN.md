# Qarzhy — Night Capital

## North Star
Personal financial overview for Kazakhstan. The user selected `.design/selected-night-capital.png`; this explicit choice overrides the three unselected Superdesign alternatives. Preserve the large balance, thin arc, lime actions, mint/purple chart and compact lower panels. No invented transactions or AI answers.

## Register and audience
Private financial tool, Russian UI, KZT, local pilot. Primary job: record a transaction and understand one's own balance and goals. Product/security context: README.md and docs/architecture.md; current server contracts remain authoritative.

## Approved logo — Фокус
The user selected the Superdesign «Фокус» proposal (draft `7e4ace87-eb9d-415c-a948-b2c5296b3616`). `public/brand/qarzhy-focus.svg` owns the exact circle, square-ended diagonal tail and central dot. Do not substitute a font character or redraw the mark. `scripts/create-icons.cjs` derives the dark-on-lime app tile, favicon, Apple icon and PWA PNGs from this one vector; run `npm run icons:generate` after a deliberate source change. PNG install icons have opaque full-square lime backgrounds and keep the full mark inside the central 80% safe circle for OS masking. `Brand` / `BrandMark` in `src/components/brand.tsx` own the shared identity on authentication, sidebar, loading and privacy screens. Preserve the selected proposal's lime tile and lower-case wordmark with lime period, using the app's existing local system fonts and reserved 32px square geometry.

## Color
Runtime ownership model B: `src/app/night.css :root` is canonical and imported after `globals.css` by `src/app/layout.tsx`. Canvas `--canvas`, surface `--surface`, text `--ink`, secondary text `--muted`, border `--line`, action `--lime`, errors `--danger`, income `--income`, expense `--expense`. Shared components consume these variables. Chart color adapter: charts.tsx; category palette: lib/finance.ts. Keep chart roles aligned with runtime tokens.

## Typography
Segoe UI / Arial system fonts, no external font network requests. Large tabular balance, restrained headings, readable localized controls. Primary form controls at least 16px on mobile. Preserve complete amounts and long user-provided labels.

## Layout and spacing
170px labeled desktop sidebar, 64px header, natural document scrolling. Balance and graph above three panels. Below 1200px recompose cards; below 950px stack overview; below 700px use mobile navigation drawer. No fixed-height clipping of forms. Global scrollbar geometry is stable.

## Shape and motion
12px panel radius, 8px controls, thin green-gray borders. Restrained lime emphasis; no decorative financial metrics. MotionConfig respects user reduced motion; CSS disables animation and transitions with prefers-reduced-motion.

## Components and states
Canonical owners: navigation and selection state in app.tsx; overview composition in overview.tsx; charts in charts.tsx; Modal/Empty/ErrorMessage in ui.tsx; transaction and goal forms in forms.tsx; native select/date inputs. Keep loading/error/empty states explicit, use the same modal and save flow across overview and full sections. Native dialog owns keyboard focus and Escape. Success uses the existing status live region. Destructive dialogs and account deletion are existing server-backed flows; do not change their semantics for styling.

## Verification
Vitest, TypeScript, production Next build, Playwright CRUD/ownership/export/delete flows, desktop/mobile screenshots. Target visible keyboard focus, contrast and no page overflow at 320px. See `.design/verification.md` for executed evidence and limitations.

## Registration availability
The server Home reads the shared registrationEnabled flag only after connection() and passes one public boolean through App to Auth. The existing authentication form owns both modes: enabled shows registration/login and an early-access badge; disabled shows login plus an explicit registration-closed notice. No form or consent field for an unavailable registration is presented. Server authorization remains the authority; client visibility never grants permission. Existing Night Capital tokens, Brand, native fields and shared validation/error owners remain unchanged.

## Planning additions
Budget and schedule cards use the existing panel, form-stack, native inputs, Modal and validatedSubmit. Shared tokens remain in night.css. QuickExpense, Planning, Comparison and CsvImport extend the selected visual identity; no new theme is introduced. Tables own their bounded horizontal/vertical overflow. Existing desktop sidebar scrolls when new destinations exceed available height.

## Motion system (2026-10-21)
`src/components/fintech-motion.tsx` owns section-scoped GSAP/ScrollTrigger reveals and desktop-only 16px decorative parallax. MotionSurface dynamically imports GSAP after the interactive app, observes newly mounted panels, refreshes after size changes and reverts all timelines/triggers/observers on unmount and media-query changes. Each panel reveals once per section visit. Desktop enters within 520ms; phones use 280ms and smaller offsets. No pinning, wheel/touch interception, global smooth-scroll ticker or permanent will-change.

Native scroll remains the input owner; CSS smooth anchors and programmatic section-to-top navigation use browser scrolling on desktop. Mobile and reduced-motion navigation use immediate native scroll. Motion owns exact-value amount crossfades, assistant/messages/busy indicator, errors and native dialog entrance. CSS owns button/menu/tooltip/status feedback; GSAP never targets the same assistant/modal nodes. Recharts owns graph paths and Motion owns category-bar scale; displayed numbers, accessible tables and BigInt calculations remain unchanged. No intermediate financial values are fabricated. `prefers-reduced-motion` is respected by all owners, including runtime preference changes.

## Visible click feedback and app motion preference (2026-10-21)
The user requested a clear animation on every button press. Actual in-app browser inspection returned prefers-reduced-motion=true and motionMode=reduced, explaining why previous effects were absent. MotionPreferencesProvider now owns system/full/minimal preference for this device (only this non-sensitive UI value is stored locally). System remains the default; full is an explicit user override. Shared hooks and root CSS apply it consistently to GSAP, Motion and Recharts.

InteractionFeedback owns delegated, nonblocking button activation feedback: 360ms independent scale and 620ms lime/danger outline pulse, keyboard/touch equivalent; minimal mode uses nonmoving outline emphasis. Pulse elements are aria-hidden, pointer-events:none, removed within660ms and capped at6. No action callback is delayed or repeated. Existing native dialogs keep focus; manual decorative popover pulse stays above them without focusable content. Section entrances increased to420ms desktop/320ms mobile with16px travel; active navigation clicks acknowledge with presentation-only replay.

## Optional WebGL ambience (2026-10-21)
`WebGLAmbience` adds a single transparent canvas behind `.overview-hero`; it never covers forms, tables or the assistant. Three.js and the GLSL engine are dynamically imported only for an overview with motion enabled. Static CSS mint/lime illumination is the fallback for reduced motion, unavailable WebGL2, chunk failure and context loss. Existing Night Capital arc, GSAP reveals/parallax, Motion amount/message/dialog transitions, Recharts paths and click feedback retain their owners.

`src/lib/fintech-webgl.ts` owns one scene, a gradient mesh and a small particle draw call. GLSL owns flowing mesh/caustics, pointer light/particle repulsion and bounded liquid refraction of background coordinates. ScrollTrigger drives shader uniforms only; no content snapshots, scroll interception, postprocessing, financial interpolation or DOM distortion. Native scroll remains authoritative. The shared system/full/minimal preference controls GPU allocation; every effect lifecycle gets a new canvas and disposes the previous context, materials, geometries, triggers, listeners, observers and RAF. Visibility pauses rendering; DPR, pixel budget and frame rate are capped independently of UI animation. Mobile uses less detail. No new provider, secret, external request or data permission is required.

Quality adaptation measures actual browser RAF cadence before the decorative draw cap, because cheap CPU submissions can still delay GPU composition. Sustained slow cadence lowers render resolution in one direction through .8/.65/.5; allocation cooldown avoids oscillation. This preserves all effects and the UI remains the priority. Repeated uniform-only trigonometry is evaluated once per draw on the CPU; inactive pulse/light branches skip zero-contribution fragment work.

## Accounts, search and calendar (2026-10-22)
The existing sidebar adds «Счета» and «Календарь». Account cards and transfer history reuse panel, native select/date, Modal, validatedSubmit, ErrorMessage and AnimatedAmount; no new motion owner or palette. Accounts show initial balances plus assigned operations and transfers; unassigned historical operations remain explicit. Archived balances stay in the total. Overview remains the operation-derived balance, labeled as such.

TransactionExplorer owns explicit filter application and50-row server pagination, with abortable requests, clear-search focus restoration, a stable loading region, no-results recovery and page clamping. Committed filters stay in App state across sections; sensitive search terms are not persisted to URLs or storage. Dates intersect the selected month unless «За всё время» is selected. All search labels, amounts and native controls remain Russian/KZT.

PaymentCalendar is an accessible Monday-first month grid with native buttons, selected-day details, exact totals and clearly labeled calculated future repeats. It never records a payment. The original anchor day survives short months and leap years. Pending overdue dates remain pending; no historical payments are invented. Layout uses natural document scroll and wraps at320px. Existing GSAP reveals, button feedback and shared reduced-motion preference apply unchanged.
