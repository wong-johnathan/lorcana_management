# Lorcana Card Inventory System — Design Spec

## Context

A personal card inventory system for Disney Lorcana TCG collectors. The problem: tracking which cards you own across multiple sets is tedious without a dedicated tool. This app lets you scan/search cards, add them to your inventory with quantities, and browse your collection or the full card catalog with rich filtering. Built for multiple users so collectors can each maintain their own inventory.

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS (dark theme)
- **Backend**: Express + TypeScript
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: JWT-based (username + password)
- **Card Data Source**: [LorcanaJSON](https://lorcanajson.org/) — community-maintained dataset of all Lorcana cards

## Data Model

### Card (sourced from LorcanaJSON, stored in Postgres)

| Field        | Type       | Example                          |
|-------------|------------|----------------------------------|
| id          | string     | unique identifier                |
| name        | string     | "Elsa"                           |
| subtitle    | string     | "Snow Queen"                     |
| character   | string?    | "Elsa" (null for items/songs)    |
| types       | string[]   | ["Storyborn", "Hero", "Queen"]   |
| color       | string     | "Amethyst"                       |
| set         | string     | "The Wild Unknown"               |
| rarity      | string     | "Legendary"                      |
| inkCost     | number     | 6                                |
| strength    | number     | 4 (damage)                       |
| willpower   | number     | 6 (defense)                      |
| abilities   | string     | Full card text / abilities       |
| cardNumber  | string     | "42/204"                         |
| imageUrl    | string     | URL to card image                |

### User

| Field          | Type   | Description              |
|---------------|--------|--------------------------|
| id            | string | unique identifier        |
| username      | string | unique username          |
| passwordHash  | string | bcrypt-hashed password   |
| createdAt     | date   | account creation date    |

### InventoryEntry (per user, per card)

| Field         | Type   | Description                    |
|--------------|--------|--------------------------------|
| id           | string | unique identifier              |
| userId       | string | references User                |
| cardId       | string | references Card                |
| quantity     | number | normal copies owned            |
| foilQuantity | number | enchanted/foil copies owned    |

## Views

### 1. Scan View

Primary card-adding workflow:

1. **Open camera** — tap "Scan" tab, camera activates (or file upload on desktop)
2. **Snap photo** — take a picture of the card as a visual reference
3. **Search & match** — search bar below the photo, real-time filtering of the card database by name. Additional filters for set, color, type available.
4. **Select card** — tap a result to see full card details alongside your photo for confirmation
5. **Add to inventory** — set quantity (defaults to 1), choose normal or foil/enchanted, tap confirm
6. **Ready for next** — camera reactivates for the next card (rapid scanning flow)

### 2. Inventory View

Browse and manage your collection:

- **Card list** — image thumbnail, name, subtitle, types, color, set, rarity, quantity (normal + foil shown separately)
- **Filters** — set, color, rarity, type, character
- **Search** — find cards by name
- **Inline editing** — tap a card to expand, adjust quantity up/down or remove entirely
- **Stats summary** — total unique cards, total card count, breakdown by set (e.g. "The Wild Unknown: 42/204")

### 3. Card Database View

Full catalog of all Lorcana cards:

- **Full card list** — all cards from LorcanaJSON with image, name, subtitle, types, color, set, rarity, ink cost, strength, willpower
- **Filters** — set, color, rarity, type, character, **ownership status** (All / Owned / Not Owned)
- **Card detail** — tap to see full details including abilities text
- **Quick add** — add card to inventory directly from detail view (set quantity + normal/foil)
- **Ownership indicator** — cards you own show a badge with quantity

## Authentication

- **Register**: username + password (password hashed with bcrypt)
- **Login**: returns JWT token stored in browser
- **Protected routes**: all inventory operations require valid JWT
- **Token refresh**: JWT includes expiry, refresh on activity

## API Endpoints

### Auth
- `POST /api/auth/register` — create account
- `POST /api/auth/login` — get JWT token

### Cards (public)
- `GET /api/cards` — list all cards (with pagination, filtering, search)
- `GET /api/cards/:id` — single card details

### Inventory (authenticated)
- `GET /api/inventory` — list user's inventory (with filters)
- `POST /api/inventory` — add card to inventory (cardId, quantity, foilQuantity)
- `PATCH /api/inventory/:id` — update quantity
- `DELETE /api/inventory/:id` — remove card from inventory
- `GET /api/inventory/stats` — collection statistics

## UI & Styling

- **Dark theme** — dark background to make card art pop
- **Tailwind CSS** — utility-first styling
- **Responsive** — works on phone (primary use case for scanning) and desktop
- **Bottom navigation** — 3-tab bar (Scan, Inventory, Database) on mobile; sidebar on desktop
- **Card grid** — responsive grid layout for card browsing

## Card Data Import

On first run (or via admin action), fetch the full LorcanaJSON dataset and seed the Postgres `Card` table. Periodically refresh when new sets release. The LorcanaJSON data includes all fields we need: name, subtitle, types, color, set, rarity, ink cost, strength, willpower, abilities, card number, and image URLs.

## Project Structure

```
lorcana-inventory/
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/      # reusable UI components
│   │   ├── pages/           # Scan, Inventory, Database views
│   │   ├── hooks/           # custom React hooks
│   │   ├── services/        # API client functions
│   │   ├── types/           # TypeScript types
│   │   └── App.tsx
│   ├── index.html
│   ├── tailwind.config.ts
│   └── vite.config.ts
├── server/                  # Express backend
│   ├── src/
│   │   ├── routes/          # API route handlers
│   │   ├── middleware/       # auth middleware
│   │   ├── services/        # business logic
│   │   └── index.ts
│   └── prisma/
│       └── schema.prisma    # database schema
├── package.json
└── docs/
```

## Verification Plan

1. **Database**: Run Prisma migrations, verify tables created in Postgres
2. **Card import**: Seed database from LorcanaJSON, verify card count matches
3. **Auth**: Register a user, login, verify JWT is returned and works on protected routes
4. **Scan flow**: Open scan view on phone, take photo, search for card, add with quantity, verify it appears in inventory
5. **Inventory**: Check quantity editing, filtering, stats accuracy
6. **Database view**: Browse all cards, filter by ownership, verify Owned/Not Owned filter works
7. **Responsive**: Test on mobile viewport and desktop viewport
