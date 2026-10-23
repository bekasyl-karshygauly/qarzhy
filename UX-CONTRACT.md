# Qarzhy interaction contract

## Canonical UI Map
| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Brand identity | Brand / BrandMark in brand.tsx | Approved Фокус vector in public/brand/qarzhy-focus.svg; DESIGN.md | Link with wordmark, decorative loading mark, generated install icons | .design/qarzhy-logos/verification.md |
| Select/Listbox | Native select in forms.tsx | Existing transaction form | Category | tests/e2e/app.spec.ts |
| Date | Native date/month input | forms.tsx and app.tsx | Transaction date, goal deadline, month filter | tests/e2e/app.spec.ts |
| Form | forms.tsx, auth.tsx, settings.tsx, assistant.tsx | validatedSubmit in ui.tsx plus server Zod validation | Existing create/edit flows | tests/e2e/app.spec.ts |
| Scrollbar | night.css | DESIGN.md | Natural document scroll; category panel local scroll | .design/verification.md |
| Toast | App status live region | app.tsx | Save/loading status; ErrorMessage alerts | tests/e2e/app.spec.ts |
| CRUD | App modal plus API route | Existing user-scoped API | Transaction and goal create/edit/delete | tests/e2e/app.spec.ts |

## Preserved behavior
Russian labels and KZT formatting. Month/section state stays local for this private MVP. Native date/select controls retain platform keyboard and popup behavior. Shared validatedSubmit invokes native reportValidity for required/min/max/pattern checks before server validation; errors remain beside the form. Saves close the modal and reload the user's data; errors retain entered values. Delete confirmations and account-password confirmation remain unchanged. Existing account export/deletion and optional provider consent are authoritative server-backed flows.

## Scope
The redesign preserves domain validation and privacy rules. Forms declare noValidate and explicitly invoke browser validity through the shared validatedSubmit owner. The chat textarea has a stable 140px minimum height and internal text scrolling.

## Registration availability
ALLOW_REGISTRATION opens registration only for the exact configured value true; absent or malformed values are closed. One shared server helper controls the API and the runtime boolean passed to Auth after Next connection(), rather than a build-time public environment variable. Open mode keeps explicit consent and registration/login tabs. Closed mode has login only and explains that new accounts are unavailable; existing accounts can still sign in. Auth tabs and submit are disabled while submitting, error feedback remains beside the form, and registration never enables AI or voice permissions. The displayed privacy-policy version and newly stored consent version share lib/privacy.ts. Deployment approval and data-hosting readiness remain separate from this runtime switch.

## Planning workflow contract
Planning forms reuse ui.tsx Modal/ErrorMessage/validatedSubmit and native category/date controls. Successful writes reload owner-scoped data and announce success. Errors retain the current form. Deletion and recurring expense recording require the shared confirmation dialog. Record payment is accounting only and advances exactly one occurrence. CSV requires preview plus explicit KZT confirmation; any invalid row blocks the entire import. Favorite categories are account data, never localStorage. Budget warnings are derived from current expenses and remain visible in Overview. PWA does not cache private data; offline writes are unavailable.

## Motion ownership
- MotionSurface owns only decorative panel appearance and a desktop-only background offset; content remains visible if the optional chunk fails.
- All new GSAP context, matchMedia, resize/mutation observer and scheduled frame resources are cleaned on section unmount. Keyboard focus completes the containing reveal immediately.
- Amount changes render the real formatted value immediately and animate its presentation only. No animation may write to server data or interpolate displayed monetary values.
- Native dialog showModal/Escape/focus restoration and submit/close timing are preserved; entrance does not delay business actions.
- Assistant animation uses existing busy/messages state; test fixture responses are browser-test-only and never presented in the product.
- Reduced-motion users receive static decorations, immediate native scroll and static chart values; desktop wheel, touchpad and mobile touch remain native.

## Per-device motion control
The topbar native select «Анимации интерфейса» chooses system/full/minimal and persists only that preference in localStorage. Default system honors OS reduced motion; full requires an explicit user choice. All animation owners use the shared motion-preferences hook. Disabled controls produce no activation effect. Global click feedback never prevents default, dispatches another click, delays submission, or changes API payloads; repeated active-section animation does not remount section state. Decorative pulses must never capture pointers or keyboard focus and must clean up after660ms/preference changes.

## WebGL ownership
The overview's optional `WebGLAmbience` is aria-hidden and pointer-events:none. Passive pointer/click listeners on its parent update shader uniforms without changing the event, action or financial payload. Existing components and transform owners remain intact. Only the backdrop is refracted; text, numbers and charts stay readable. Minimal/system-reduced mode allocates no GPU context. Missing WebGL2 and context loss keep the CSS background and every business action available. One canvas is owned by one effect lifecycle, including preference toggles and development strict-mode cleanup. Phone quality is lower and scrolling stays native.

## Accounts and transfers
Wallets are manual KZT records, never a bank connection. Initial balance is a baseline, editable explicitly and excluded from income/expense analytics. Accounts have cash/card/deposit kind; up to100 including archived. Existing operations remain unassigned. Standard transaction forms can select an active wallet; existing transactions may retain their archived wallet. A repeat opens for review, retaining an active wallet and clearing an archived one. Quick entry/CSV/recurring writes start unassigned and can be reassigned through the existing edit flow.

Transfers require two different active owner wallets, a positive exact amount, date and stable request UUID. They move recorded balances without changing total wealth or income/expense analytics. Save/retry idempotency prevents duplicate transfers; reusing a key with different data conflicts. Account and transfer forms use the existing Modal/validatedSubmit/ErrorMessage owners. Successful saves return to the account list and reload current owner data; failures retain input. Archiving/restoring uses a named confirmation. Archived records and balances are retained. Deleting a transfer requires confirmation explaining recalculation of both wallets. Account export and deletion include the new records.

## Search and payment calendar
Transaction filters use explicit «Применить фильтры» or Enter, with50-row server paging. Clear cancels stale work, updates committed search immediately and returns focus; reset clears all filters. Invalid dates/amount ranges show server errors without discarding filters. No-results differs from an empty ledger. Sensitive query/filter values remain in transient App memory rather than URLs, logs or localStorage, matching the private MVP's section/month state. Filtering is confined to the signed-in owner and never changes summary totals.

Calendar day buttons use localized accessible names, selected/today states and a live detail summary. The grid is read-only for finance; «Открыть план» leads to existing recurring CRUD/confirmation. Planned projections are visibly estimates; overdue pending occurrences are not marked paid and future expenses are not created automatically. Calendar uses the existing business date zone Asia/Almaty.

## Assistant data modes
Settings and Assistant use the server's contextMode and dataPolicy. Unpaid or unverified Gemini is always general, regardless of a financial-mode request in environment configuration. General mode sends only the typed question and never calls the financial-summary reader. It explains the absence of account context, uses educational suggestions, and warns against personal/confidential input. Google unpaid data-use and global-location disclosures appear before consent. Financial mode remains available for a separately configured suitable provider; changing mode or data policy invalidates previous consent. Consent must be saved by the user; integration setup never enables it on a real account. Both modes reuse the existing forms, errors, busy state and message animations. Gemini voice is unavailable until separately integrated. Provider quota errors retain the question and let the user retry.
