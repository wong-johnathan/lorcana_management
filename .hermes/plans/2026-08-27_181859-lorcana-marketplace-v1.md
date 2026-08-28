# Lorcana Marketplace V1 Product and Implementation Plan

> **For Hermes:** Use the `subagent-driven-development` skill to implement this plan task-by-task. Do not begin implementation until Johnathan explicitly approves execution.

**Goal:** Extend the original Express/React Lorcana inventory application into a global card marketplace where users explicitly publish inventory extras, buyers discover exact card printings, both parties negotiate in-app, sellers reserve stock, completed deals reconcile inventory, and mutual blind reviews build credibility.

**Architecture:** Reuse the existing `ExtraForSaleListing` and inventory/retention-policy foundation rather than introducing a second listing concept. Add marketplace discovery, enquiry, offer, reservation, transaction, notification, email-verification, foreign-exchange, moderation, and reputation domains behind the existing Express API and React SPA. PostgreSQL remains authoritative for inventory, reservations, transaction history, and reviews.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS, React Router 7, Express 5, Prisma, PostgreSQL 16, JWT authentication, MinIO/S3 for existing profile images, Vitest/Supertest, Playwright, Docker Compose, GitHub Actions.

---

## 1. Agreed product boundary

The platform owns:

- Global card and seller discovery.
- Seller listings backed by actual inventory extras.
- In-app enquiries and structured offers.
- Seller-approved, time-limited reservations.
- Sold status and inventory reconciliation.
- Buyer confirmation and automatic completion.
- Mutual buyer/seller reviews with blind reveal.
- Basic reputation, reporting, blocking, and moderation records.

The platform does **not** own in V1:

- Payment processing or escrow.
- Shipping labels, tracking, or carrier integrations.
- Refunds, chargebacks, or buyer-protection guarantees.
- Auctions or multi-seller carts.
- Card-for-card trading.
- Seller-uploaded listing photos.
- General-purpose direct messaging.
- Real-time WebSocket chat.

Payment and fulfilment remain external arrangements between buyer and seller. The marketplace verifies completion of its reservation workflow, not payment settlement.

## 2. Locked decisions

| Area | V1 decision |
|---|---|
| Canonical application | Extend the original Express/React application first |
| Discovery | Global |
| Fulfilment | Sellers define origin, methods, and destination coverage |
| Marketplace shape | Card-centric discovery; show all seller offers for one exact printing |
| Pricing | Seller chooses `FIXED` or `ACCEPTS_OFFERS` |
| Participation | Verified email required to publish or enquire |
| Listing images | Canonical stock card image only |
| Condition | Seller-declared using a fixed condition enum |
| Reservation | Seller-approved, time-limited; recommended V1 default is 48 hours |
| Sold flow | Seller marks sold; buyer confirms; auto-complete after 7 days |
| Reviews | Buyer and seller review each other with blind reveal |
| Review window | 30 days after transaction completion |
| Currency | Original seller price plus approximate viewer-currency conversion |
| Payments | External to the platform |
| Inventory | Physical-stock source of truth |
| SEO migration | Validate in original app before considering a port to the Next.js rebuild |

## 3. Existing-listing privacy and publication boundary

Existing public Extras for Sale listings must **not** automatically become global marketplace listings.

Add an explicit `marketplaceVisible` field and `Publish to marketplace` owner action. A listing is eligible for global marketplace discovery only when:

```text
seller email is verified
AND listing status is active
AND marketplaceVisible is true
AND asking price and ISO currency are present
AND condition and card language are present
AND seller/listing fulfilment coverage is configured
AND calculated available quantity is greater than zero
```

Existing unpriced or incomplete listings may continue to appear on the seller's public collection Extras for Sale tab without entering global search.

Never publish computed Suggested Extras automatically. Suggested Extras remain private until the owner explicitly creates and publishes a listing.

## 4. Core user journeys

### 4.1 Seller publishes an extra

1. Inventory and retention policy calculate a sellable extra.
2. Seller creates or edits an `ExtraForSaleListing`.
3. Seller supplies asking price, currency, pricing mode, condition, language, location/coverage, and fulfilment methods.
4. Seller explicitly enables `Publish to marketplace`.
5. Server validates verified email, inventory extras, variant availability, listing completeness, and fulfilment coverage.
6. Listing becomes globally discoverable while available quantity remains greater than zero.

### 4.2 Buyer discovers a card

1. Buyer searches `/marketplace` by card name, subtitle, or collector number.
2. Results group offers by exact card printing and variant.
3. Buyer filters by set, rarity, ink, variant, condition, language, seller country, destination country, fulfilment method, availability, and price.
4. Buyer opens `/marketplace/card/:cardId` to compare seller offers.
5. Anonymous users may browse; verified authenticated users may enquire.

### 4.3 Fixed-price enquiry

1. Buyer chooses quantity and sends an enquiry at the listed unit price.
2. Seller accepts or declines.
3. Acceptance creates a reservation if stock is still available.
4. Buyer and seller arrange payment and fulfilment externally.

### 4.4 Negotiable-price enquiry

1. Listing has `ACCEPTS_OFFERS` enabled.
2. Buyer proposes quantity and unit price.
3. Seller accepts, declines, or sends a structured counteroffer.
4. Buyer may accept, counter, or withdraw.
5. Reservation is created only when both parties accept the same structured terms.

### 4.5 Sold and completion flow

1. Seller marks an active reservation sold.
2. In one database transaction, the server validates stock, decrements the correct inventory variant, snapshots the agreed terms, and moves the transaction to buyer confirmation.
3. Buyer confirms completion or reports a problem.
4. If the buyer takes no action for seven days and no dispute is open, the transaction auto-completes.
5. Completed-deal counts update only at `COMPLETED`.
6. A 30-day blind-review window opens.

## 5. Marketplace UX

### 5.1 Public marketplace: `/marketplace`

Use a card-centric result model:

```text
Elsa - Spirit of Winter
207/204 • Enchanted • Holofoil
3 available sellers • From S$180
```

Search and filters:

- Card name, subtitle, and collector number.
- Set.
- Rarity.
- Ink colour.
- Normal, Foil, or Holofoil variant.
- Condition.
- Card language.
- Seller country.
- Ships to selected country.
- Local meetup, domestic shipping, or international shipping.
- Price/currency.
- Available now, enabled by default.

Default ranking:

1. Exact printing match.
2. Can fulfil to the buyer's selected country.
3. Available quantity.
4. Approximate converted price.
5. Seller responsiveness/reputation as a secondary signal.

A cheap listing that cannot reach the buyer must not rank as the best usable result.

### 5.2 Card offer page: `/marketplace/card/:cardId`

Show all offers for one exact card printing:

- Canonical card image and identifiers.
- Original asking price and currency.
- Approximate viewer-currency conversion.
- Fixed-price or accepts-offers label.
- Available quantity.
- Seller-declared condition and card language.
- Seller origin and public locality.
- Fulfilment methods and destination coverage.
- Seller rating, completed sales, and verified-email indicator.
- `Send enquiry` action.

Every offer displays:

> Condition reported by seller; no physical photos provided.

Do not imply that the platform inspected or verified physical condition.

### 5.3 Buyer dashboard: `/marketplace/enquiries`

Show:

- Awaiting seller.
- Awaiting buyer.
- Reserved.
- Awaiting completion confirmation.
- Completed.
- Declined, withdrawn, cancelled, expired, or disputed.
- Unread notification indicators.

### 5.4 Seller dashboard

Extend `/extras-for-sale` with:

- Suggested Extras.
- Active Listings.
- Incoming Enquiries.
- Reservations.
- Sold History.
- Marketplace Settings.

Preserve the existing public `/collection/:userId?tab=extras` surface.

## 6. Listing, profile, and fulfilment contract

Seller marketplace defaults:

- Required ISO origin country code.
- Optional public city/region label; never exact address.
- Default ISO currency.
- Local-meetup availability.
- Domestic-shipping availability.
- International-shipping availability.
- Worldwide shipping or selected destination countries.

Individual listings may inherit defaults or override them.

Exact addresses, private email addresses, and private contact details must never appear in marketplace or public-profile API payloads. They may be shared privately by users after agreement.

### 6.1 Listing condition enum

```text
MINT
NEAR_MINT
LIGHTLY_PLAYED
MODERATELY_PLAYED
HEAVILY_PLAYED
DAMAGED
```

### 6.2 Pricing modes

```text
FIXED
└─ Buyer enquires at the listed price; seller still approves reservation.

ACCEPTS_OFFERS
├─ Buyer proposes quantity and unit price.
├─ Seller accepts, declines, or counters.
└─ Buyer must accept a seller counter before reservation.
```

Every globally published marketplace listing requires an asking price. `TCG reference` remains separate read-only market context and must never be presented as the seller's asking price.

Shipping is negotiated separately and recorded in the accepted offer/reservation snapshot.

## 7. Inventory availability and reservation invariants

Use one shared backend service for all calculations:

```text
physicalExtra = max(0, ownedQuantity - keepQuantity)

listableQuantity =
  min(desiredListingQuantity, physicalExtra)

availableQuantity =
  max(0, listableQuantity - activeReservedQuantity)
```

This service must be reused by:

- Suggested Extras.
- Owner listing management.
- Public collection Extras for Sale.
- Marketplace search.
- Card offer pages.
- Enquiry acceptance.
- Reservation creation and expiry.
- Sold workflow.

An enquiry does not lock stock. Only mutual acceptance of structured terms creates a reservation.

Operations that would make active reservations impossible must be rejected with a user-visible explanation and links to the affected reservations:

- Inventory quantity decrement.
- Inventory entry deletion.
- Inventory wipe.
- Default keep-policy changes.
- Per-card retention-override changes.
- Listing quantity reduction.
- Listing variant changes.

### 7.1 Concurrency

Reservation acceptance must execute inside a database transaction:

1. Re-read inventory and effective keep quantities.
2. Re-read the listing.
3. Sum non-expired active reservations.
4. Validate requested quantity and accepted terms.
5. Create the reservation.
6. Transition the enquiry.
7. Commit together.

All state-changing endpoints must be idempotent. Retries must not double-reserve, double-decrement inventory, duplicate transactions, reveal reviews twice, or increment reputation twice.

Reservation expiry should be correct at read time by filtering `expiresAt > now`, with a scheduled cleanup process that marks expired records and emits notifications.

## 8. Enquiry and transaction state machines

### 8.1 Enquiry/reservation states

```text
PENDING_SELLER
├─ seller accepts ─────────────→ RESERVED
├─ seller counters ────────────→ AWAITING_BUYER
├─ seller declines ────────────→ DECLINED
└─ buyer withdraws ────────────→ WITHDRAWN

AWAITING_BUYER
├─ buyer accepts ──────────────→ RESERVED
├─ buyer counters ─────────────→ PENDING_SELLER
└─ buyer withdraws ────────────→ WITHDRAWN

RESERVED
├─ seller marks sold ──────────→ AWAITING_BUYER_CONFIRMATION
├─ either party cancels ───────→ CANCELLED
└─ reservation expires ────────→ EXPIRED

AWAITING_BUYER_CONFIRMATION
├─ buyer confirms ─────────────→ COMPLETED
├─ buyer reports problem ──────→ DISPUTED
└─ no action for 7 days ───────→ COMPLETED
```

A dispute prevents automatic completion. Inventory remains decremented because the seller asserted that the physical item left their possession.

### 8.2 Mark-sold transaction

When the seller marks a reservation sold, one PostgreSQL transaction must:

1. Validate actor, reservation state, and expiry.
2. Validate the reserved physical stock.
3. Decrement the correct normal, foil, or holofoil inventory field.
4. Create an immutable transaction snapshot.
5. Transition to `AWAITING_BUYER_CONFIRMATION`.
6. Recalculate remaining listing availability.
7. Prevent duplicate effects on retry.

## 9. Currency and FX contract

- Store all money as integer minor units plus ISO currency.
- Seller listing currency remains authoritative.
- Reservation and transaction records retain the original agreed currency.
- Cache exchange rates with provider/source and retrieval timestamp.
- Display conversion as approximate, for example:

```text
US$120.00
≈ S$162.40
```

- Converted values are display and ranking aids only.
- Currency conversion never changes negotiated terms.
- If a rate is unavailable or stale, show the original amount without fabricating a conversion.
- Shipping price is stored separately in the reservation/transaction snapshot.
- Select the concrete FX provider during the technical implementation pass; isolate it behind a provider interface so marketplace logic does not depend directly on one external API.

## 10. Email verification, notifications, and account recovery

Marketplace participation requires verified email.

Rules:

- Email uniqueness is case-insensitive.
- Store only hashes of verification/reset tokens.
- Tokens expire and are single-use.
- Verification and password-reset endpoints are rate-limited.
- Existing users retain inventory access but cannot globally publish or enquire until verified.
- Changing email clears verification and requires re-verification.
- Email addresses remain private and are excluded from all public marketplace payloads.
- Add password recovery in the same phase because email becomes account-critical.

In-app and email notifications:

- New enquiry.
- New message.
- Offer or counteroffer.
- Offer accepted or declined.
- Reservation created.
- Reservation expiring soon.
- Reservation cancelled or expired.
- Seller marked sold.
- Buyer confirmation needed.
- Transaction completed.
- Blind-review reminder and reveal.
- Dispute/report updates.

Emails should link back to the relevant authenticated page and should not include private message bodies by default.

## 11. Messaging and abuse controls

- One active enquiry thread per buyer/listing.
- No self-enquiries.
- Plain-text messages only in V1.
- Maximum message length.
- Enquiry and message rate limits.
- Server-side participant authorization for every thread read/write.
- Block-user feature.
- Report listing, user, enquiry, message, or review.
- Moderator-visible audit trail.
- Paginated messages and marketplace results.
- Do not implement unrestricted direct messages; every conversation remains bound to a listing and enquiry.

Messages and structured offers must be separate records. Agreed quantity, unit price, shipping price, currency, fulfilment method, and destination must never depend on parsing free-text chat.

## 12. Mutual blind reviews and credibility

Both buyer and seller may review each other after a completed transaction.

### 12.1 Blind reveal

```text
Transaction completes
        ↓
30-day review window opens
        ↓
Buyer and seller submit independently
        ↓
Both submitted? Reveal both immediately
Only one submitted? Reveal it when the 30-day window closes
Neither submitted? Close silently
```

Neither party can see the counterpart's rating, comment, or tags before submitting their own review.

### 12.2 Buyer reviews seller

Required:

- Overall rating from 1 to 5.

Optional tags:

- Fast response.
- Accurate description.
- Card condition as described.
- Well packed.
- Smooth meetup.
- Friendly seller.
- Slow response.
- Condition differed.
- Fulfilment issue.

### 12.3 Seller reviews buyer

Required:

- Overall rating from 1 to 5.

Optional tags:

- Fast payment.
- Good communication.
- Arrived on time.
- Smooth transaction.
- Respectful buyer.
- Slow response.
- Late or missed meetup.
- Payment issue.

Both parties may leave an optional text comment.

### 12.4 Review lifecycle

```text
DRAFT
  ↓ submit
SEALED
  ├─ counterpart submits ─────→ REVEALED
  ├─ 30-day deadline passes ──→ REVEALED
  └─ transaction disputed ────→ FROZEN

REVEALED
  ├─ reported ────────────────→ UNDER_REVIEW
  ├─ moderator upholds ───────→ VISIBLE
  └─ moderator removes ───────→ HIDDEN
```

Rules:

- Reviews are editable only while sealed.
- Revealed reviews are locked.
- Users cannot delete revealed reviews.
- Moderators may hide abusive content while retaining the record and audit history.
- A dispute freezes unrevealed reviews until resolution.
- Only `COMPLETED` transactions are reviewable.
- One review per participant per transaction.
- No public review replies in V1.

### 12.5 Reputation display

Seller offer cards/profile:

```text
★ 4.8 seller rating
37 seller reviews · 52 completed sales
Email verified · Member since 2026
```

Buyer identity inside enquiries:

```text
★ 4.7 buyer rating
14 buyer reviews · 19 completed purchases
Email verified
```

Buyer and seller reputations remain separate. Public profiles may show both roles independently.

Do not rank users by raw average alone. Internally use a conservative score informed by:

- Bayesian-adjusted rating.
- Completed deal count.
- Unique counterparties.
- Account age.
- Dispute/cancellation rate.
- Responsiveness.
- Suspicious repeated reciprocal transactions.

Public UI remains understandable and shows raw rating, review count, and completed-deal count.

Because the platform does not process payment, use `Completed marketplace deal` or `Review from a completed deal`. Never claim `Verified purchase` or `Payment verified`.

Anti-farming controls:

- Track unique counterparties.
- Downweight suspicious repeated deals between the same accounts internally.
- Flag reciprocal review farming patterns.
- Exclude disputed or moderator-invalidated transactions.
- Rate-limit repeated completions between the same accounts.
- Never let completed-deal count alone determine ranking.

## 13. Proposed Prisma/domain model

Extend existing models rather than creating a parallel inventory/listing system.

### 13.1 User/account additions

```text
User
- email
- emailNormalized
- emailVerifiedAt

EmailVerificationToken
- userId
- tokenHash
- expiresAt
- consumedAt

PasswordResetToken
- userId
- tokenHash
- expiresAt
- consumedAt
```

### 13.2 Listing and fulfilment additions

```text
ExtraForSaleListing
- marketplaceVisible
- pricingMode
- askingPriceMinor
- currency
- condition
- cardLanguage
- originCountryCode
- publicLocality
- allowsMeetup
- shipsDomestically
- shipsInternationally
- shipsWorldwide
- listing status and timestamps

ListingDestinationCountry
- listingId
- countryCode
```

Prefer a normalized destination-country relation over an unqueryable free-text coverage field.

### 13.3 Enquiry and transaction records

```text
MarketplaceEnquiry
- listingId
- buyerId
- status
- lastActivityAt

EnquiryMessage
- enquiryId
- senderId
- message
- createdAt

EnquiryOffer
- enquiryId
- proposedByUserId
- quantity
- unitPriceMinor
- shippingPriceMinor
- currency
- fulfilmentMethod
- buyerCountryCode
- createdAt

MarketplaceReservation
- enquiryId
- acceptedOfferId
- quantity
- agreed unit/shipping prices
- currency
- buyer country
- fulfilment method
- expiresAt
- status

MarketplaceTransaction
- reservationId
- sellerId
- buyerId
- card/variant snapshot
- quantity
- agreed unit/shipping prices
- currency
- completion status
- completedAt
```

### 13.4 Reviews, notifications, moderation, and FX

```text
MarketplaceReview
- transactionId
- reviewerId
- revieweeId
- reviewerRole
- rating
- comment
- status
- submittedAt
- revealedAt
- moderation fields

MarketplaceReviewTag
- reviewId
- tag

Notification
- userId
- type
- related entity identifiers
- readAt

UserBlock
- blockerId
- blockedId

MarketplaceReport
- reporterId
- target type/id
- reason
- status
- moderation fields

FxRate
- baseCurrency
- quoteCurrency
- rate
- source
- fetchedAt
```

Important constraints:

- Unique normalized email.
- Unique `(transactionId, reviewerId)` review.
- Unique active enquiry per `(listingId, buyerId)` where practical in the domain/service layer.
- Reviewer and reviewee must be transaction participants.
- Rating constrained to 1 through 5.
- Quantity and money fields must be non-negative integers.
- Actor role and transition permissions are derived server-side.
- Every Prisma schema change must include a committed migration directory and SQL file.

## 14. API surface

Suggested route groups:

```text
GET  /api/marketplace
GET  /api/marketplace/cards/:cardId/offers

POST /api/marketplace/listings/:listingId/enquiries
GET  /api/marketplace/enquiries
GET  /api/marketplace/enquiries/:id
POST /api/marketplace/enquiries/:id/messages
POST /api/marketplace/enquiries/:id/offers
POST /api/marketplace/enquiries/:id/accept
POST /api/marketplace/enquiries/:id/decline
POST /api/marketplace/enquiries/:id/withdraw

POST /api/marketplace/reservations/:id/cancel
POST /api/marketplace/reservations/:id/mark-sold
POST /api/marketplace/transactions/:id/confirm
POST /api/marketplace/transactions/:id/dispute

POST /api/marketplace/transactions/:id/reviews
GET  /api/marketplace/users/:userId/reputation
POST /api/marketplace/reviews/:id/report

GET  /api/notifications
POST /api/notifications/:id/read

POST /api/auth/email/verify/request
POST /api/auth/email/verify/confirm
POST /api/auth/password-reset/request
POST /api/auth/password-reset/confirm
```

Register specific Express routes before generic `/:id` routes. Express route order is a known project failure mode.

No endpoint may accept an arbitrary next status from the client. Expose explicit action endpoints and validate actor, current state, stock, and transition server-side.

## 15. Likely files and directories to change

Exact names may be refined after a fresh codebase inspection before implementation.

### Backend

- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/<timestamp>_marketplace_foundation/migration.sql`
- Modify: `server/src/index.ts`
- Modify: `server/src/routes/auth.ts`
- Modify: `server/src/routes/inventory.ts`
- Modify: `server/src/routes/extrasForSale.ts`
- Modify: `server/src/routes/public.ts`
- Create: `server/src/routes/marketplace.ts`
- Create: `server/src/routes/notifications.ts`
- Create: `server/src/services/marketplaceAvailability.ts`
- Create: `server/src/services/marketplaceTransitions.ts`
- Create: `server/src/services/marketplaceReputation.ts`
- Create: `server/src/services/emailVerification.ts`
- Create: `server/src/services/notifications.ts`
- Create: `server/src/services/fxRates.ts`
- Create: `server/src/services/marketplaceModeration.ts`
- Extend existing storage/mail/config modules only after inspection.

### Frontend

- Modify: `client/src/App.tsx`
- Modify: `client/src/types/index.ts`
- Modify: `client/src/services/api.ts`
- Modify: `client/src/pages/ExtrasForSalePage.tsx`
- Modify: `client/src/pages/PublicCollectionPage.tsx`
- Create: `client/src/pages/MarketplacePage.tsx`
- Create: `client/src/pages/MarketplaceCardPage.tsx`
- Create: `client/src/pages/MarketplaceEnquiriesPage.tsx`
- Create: `client/src/pages/MarketplaceEnquiryPage.tsx`
- Create: `client/src/components/marketplace/MarketplaceCardResult.tsx`
- Create: `client/src/components/marketplace/MarketplaceOfferCard.tsx`
- Create: `client/src/components/marketplace/MarketplaceFilters.tsx`
- Create: `client/src/components/marketplace/EnquiryThread.tsx`
- Create: `client/src/components/marketplace/OfferComposer.tsx`
- Create: `client/src/components/marketplace/ReputationSummary.tsx`
- Create: `client/src/components/marketplace/BlindReviewDialog.tsx`
- Create: `client/src/components/marketplace/FulfilmentCoverageEditor.tsx`
- Create: `client/src/components/marketplace/NotificationIndicator.tsx`

### Tests and documentation

- Extend server Vitest/Supertest route and service suites under the existing test structure.
- Extend client Vitest/component suites under `client/src/test/`.
- Modify: `client/e2e/app.spec.ts` and its API mock table.
- Add focused Playwright marketplace flows under `client/e2e/` if splitting the existing spec improves maintainability.
- Update: `hermes.md` after implementation so it reflects the marketplace domain and current verification commands.
- Update relevant references under the Lorcana skill after the feature is implemented and verified.

## 16. Phased implementation sequence

### Phase 1: Domain and account foundation

- Inspect the current Prisma schema, auth routes, test infrastructure, and Extras for Sale implementation.
- Add failing tests for email normalization, token hashing/expiry, marketplace eligibility, availability calculation, and state transitions.
- Add email verification and password recovery.
- Add marketplace enums/models and migration SQL.
- Implement deterministic pure availability and transition helpers.
- Verify existing inventory and Extras for Sale behaviour remains unchanged.

### Phase 2: Marketplace-ready listings

- Add seller marketplace defaults and listing overrides.
- Add condition, language, currency, pricing mode, and fulfilment validation.
- Add explicit marketplace publication.
- Keep all pre-existing listings opted out by default.
- Test fixed/offer modes, invalid currencies, unsupported variants, missing coverage, unverified seller, and zero availability.

### Phase 3: Public discovery

- Add card-centric marketplace query and offer endpoints.
- Add `/marketplace` and `/marketplace/card/:cardId`.
- Add destination-aware filtering and ordering.
- Add original and approximate converted price display.
- Test anonymous browsing and verified-auth enquiry gating.

### Phase 4: Enquiries and negotiation

- Add enquiry, message, and structured-offer models/services/routes.
- Add buyer and seller dashboards.
- Enforce one active enquiry per buyer/listing and no self-enquiries.
- Add rate limits and authorization tests.
- Add in-app and email notifications.

### Phase 5: Reservations

- Add seller-approved reservation creation.
- Add counteroffer acceptance.
- Enforce transactional stock validation and 48-hour expiry.
- Guard every inventory/keep/listing mutation that could invalidate a reservation.
- Add cancellation, expiration, and reminder notifications.
- Test concurrent acceptance attempts.

### Phase 6: Sold, confirmation, and reviews

- Add atomic mark-sold workflow and immutable transaction snapshot.
- Add buyer confirmation, seven-day automatic completion, and dispute state.
- Add mutual sealed reviews and 30-day reveal rules.
- Add role-specific review tags.
- Add seller/buyer reputation aggregates.
- Test idempotency of sold, completion, review reveal, and aggregate updates.

### Phase 7: Trust and hardening

- Add blocking, reporting, moderation states, and audit records.
- Add conservative reputation/ranking service.
- Detect suspicious repeated reciprocal transactions.
- Review public API payloads for email/contact/address leakage.
- Add pagination, input limits, and abuse-oriented tests.

### Phase 8: E2E, CI, deployment, and measurement

- Add Playwright coverage for marketplace discovery, listing publication, fixed-price enquiry, negotiated offer, reservation, sold/confirm, expiry, dispute, and blind review reveal.
- Update API mocks for every new frontend request.
- Run server/client 90% coverage gates, TypeScript checks, builds, and E2E locally.
- Validate development and production Compose files.
- Push only after local CI-equivalent checks pass.
- Monitor GitHub Actions until all required jobs are green.
- Redeploy manually to Synology after merge; production does not auto-pull new images.
- Add product metrics for searches, listing eligibility, enquiries, reservations, completions, response time, expiry/cancellation/dispute rates, unique counterparties, and photo requests.

## 17. Required test cases

### Availability and inventory

- `7 normal - 4 keep = 3 physical extras`.
- Desired quantity caps public/listable quantity.
- Active reservations reduce available quantity.
- Expired reservations do not reduce current availability.
- Inventory decrement below reserved stock is rejected.
- Inventory wipe with active reservations is rejected.
- Keep-policy and retention-override changes cannot invalidate reservations.
- Normal, Foil, and Holofoil variants are validated against `foilTypes`.

### Listing publication

- Existing listings are not globally published after migration.
- Unverified users cannot publish or enquire.
- Missing price, currency, condition, language, or coverage blocks publication.
- Zero available quantity hides listing from marketplace.
- Public collection Extras for Sale remains functional.

### Enquiries and offers

- Buyer cannot enquire on own listing.
- Fixed-price listing rejects counteroffer action.
- Offer-enabled listing permits buyer/seller counters.
- Unauthorized users cannot read or write another thread.
- One active buyer/listing enquiry is enforced.
- Message and offer limits are enforced.

### Reservation and concurrency

- Enquiry alone does not reserve stock.
- Seller acceptance reserves currently available stock.
- Buyer acceptance of seller counter reserves stock.
- Concurrent accepts cannot oversell.
- Cancellation and expiry release availability.
- Retry of acceptance is idempotent.

### Sold and completion

- Mark-sold decrements exactly one inventory variant once.
- Transaction snapshot does not change when listing/card display data later changes.
- Buyer confirmation completes the transaction.
- Automatic completion occurs only after seven days without dispute.
- Dispute blocks automatic completion and reputation increment.

### Reviews and reputation

- Only completed transaction participants may review.
- One review per participant/transaction.
- First review remains sealed before counterpart submission/deadline.
- Both reviews reveal immediately when both submit.
- Single submitted review reveals at 30-day deadline.
- Frozen/disputed review does not reveal.
- Revealed review cannot be edited or deleted by user.
- Buyer and seller aggregates remain separate.
- Hidden/moderator-invalidated review is excluded from visible aggregates.
- Public labels say completed marketplace deal, never verified purchase.

### Currency

- Minor-unit money storage avoids floating-point errors.
- Original currency remains authoritative.
- Approximate conversion is labelled.
- Missing/stale FX rate does not fabricate a value.
- Reservation preserves agreed original currency and shipping amount.

### Privacy and abuse

- Public payloads exclude private email and exact address data.
- Blocked users cannot create new enquiries or messages.
- Rate limits apply to verification, password reset, enquiries, and messages.
- Report and moderation actions preserve audit history.

## 18. Verification gates

Before any push:

```bash
# Server
cd /opt/data/lorcana_management/server
npm ci
npx prisma generate
npx tsc --noEmit
JWT_SECRET=ci-secret-do-not-use npm run test:coverage
npm run build

# Client
cd /opt/data/lorcana_management/client
npm ci
npx tsc --noEmit
npm run test:coverage
npm run build
npm run test:e2e

# Compose
cd /opt/data/lorcana_management
docker compose config || docker-compose config
docker compose -f docker-compose.prod.yml config || docker-compose -f docker-compose.prod.yml config
```

Maintain at least the existing 90% statements/branches/functions/lines coverage gate. Do not weaken thresholds to accommodate marketplace code.

After push:

- Open or confirm the PR.
- Monitor all GitHub Actions jobs until green.
- Do not claim Docker validation is green if the local daemon was unavailable; defer explicitly to CI and verify there.
- After merge and DockerHub publication, manually pull and redeploy on Synology.

## 19. Risks and trade-offs

### External payment means limited verification

The platform cannot prove payment occurred. Reputation therefore means completed marketplace workflow, not verified purchase. Mitigate with blind reviews, unique-counterparty counts, disputes, moderation, account age, and anti-farming signals.

### No listing photos lowers trust

Stock images identify the card but do not prove condition or ownership. Mitigate with explicit seller-condition disclaimers and measure how frequently buyers request photos. Use evidence rather than assumption before building photo upload/moderation.

### Global discovery increases fulfilment complexity

Do not implement shipping calculators in V1. Keep coverage structured, allow shipping price in structured offers, and snapshot agreed terms.

### Reservation/inventory coupling has a large blast radius

Every inventory mutation path must understand reservations. Centralize the guard and calculation logic; route-specific copies will drift.

### SPA limits SEO

The original app is chosen for speed because the Extras for Sale foundation already exists. Treat the SEO limitation as deliberate. Validate demand and workflow before porting the marketplace to the Next.js rebuild.

### Marketplace scope can expand uncontrollably

Do not add escrow, payments, auctions, carts, real-time chat, shipping providers, or photos during V1 unless Johnathan explicitly reopens scope.

## 20. Product metrics and migration trigger

Measure:

- Marketplace searches.
- Searches with no available sellers.
- Eligible/global listings.
- Card pages viewed.
- Enquiries per listing.
- Enquiry-to-reservation conversion.
- Reservation-to-completion conversion.
- Median seller response time.
- Cancellation, expiry, and dispute rates.
- Completed deals and unique counterparties.
- Review submission rate.
- Buyer requests for physical photos.

Consider migration to the Next.js SEO rebuild only after marketplace usage validates the workflow or organic search becomes the dominant acquisition constraint. Do not maintain two writable marketplace backends.

## 21. Definition of done

Marketplace V1 is complete only when:

- Existing users can continue inventory and public-collection workflows without regression.
- Verified sellers can explicitly publish eligible extras globally.
- Buyers can discover exact card printings and compatible sellers.
- Fixed and negotiable enquiry flows work end to end.
- Reservations are concurrency-safe and protect inventory.
- Sold workflow atomically reconciles stock.
- Buyer confirmation, auto-completion, and disputes work.
- Mutual blind reviews and separate buyer/seller reputation work.
- Currency conversion is approximate and never changes agreed original terms.
- Public APIs do not leak private account or location information.
- Abuse controls and moderation records exist.
- Unit, route, component, and Playwright suites pass the existing 90% coverage gate.
- Type checks, builds, Compose validation, and GitHub Actions are green.
- Production is manually redeployed and smoke-tested after merge.
