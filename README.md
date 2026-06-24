# Lorcana Inventory Manager

A personal card inventory system for **Disney Lorcana TCG** collectors. Scan cards with AI, track your collection, and browse the full catalog — all through a dark-themed responsive web app.

## Features

- **📸 AI Card Scanning** — Snap a photo of any card and Gemini Flash identifies it, matches it against the database, and adds it to your inventory. Batch scan up to 50 cards at once.
- **📊 Collection Tracking** — Track normal and foil/enchanted quantities separately. Stats dashboard shows unique cards, total count, and per-set completion breakdowns.
- **🔍 Full Card Database** — Browse every Lorcana card ever released with rich filtering by set, color, rarity, type, character, and ownership status (Owned / Not Owned).
- **👥 Multi-User** — Each collector gets their own account with JWT auth. Inventories are isolated per user.
- **📱 Responsive** — Bottom tab navigation on mobile (primary scanning use case), sidebar on desktop.
- **🔄 Auto-Synced Data** — Card data sourced from [LorcanaJSON](https://lorcanajson.org/), seeded on startup and refreshable when new sets drop.

## Tech Stack

| Layer    | Tech                                                              |
| -------- | ----------------------------------------------------------------- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, React Router            |
| Backend  | Express 5, TypeScript, Prisma ORM                                 |
| Database | PostgreSQL 16                                                     |
| Auth     | JWT (bcrypt password hashing)                                     |
| AI       | Gemini 2.5 Flash (card recognition from photos)                   |
| Infra    | Docker Compose, Nginx reverse proxy, GitHub Actions CI/CD         |

## Quick Start (Docker)

```bash
# Clone
git clone https://github.com/wong-johnathan/lorcana_management.git
cd lorcana_management

# (Optional) Add your Gemini API key for AI card scanning
echo "GEMINI_API_KEY=your-key-here" > .env

# Launch dev stack (PostgreSQL + server + nginx + Vite dev server)
docker compose --profile dev up -d

# Open http://localhost:5173
```

The server auto-runs Prisma migrations and seeds the card database from LorcanaJSON on first start.

Without `GEMINI_API_KEY`, manual search-based card adding still works — only the photo recognition feature requires it.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   React SPA  │────▶│    Nginx     │────▶│   Express    │──▶ PostgreSQL
│  (Vite dev)  │     │  (reverse    │     │   API (3001) │    (card data,
│  :5173       │     │   proxy)     │     │              │     users,
│              │     │  :80         │     │              │     inventory)
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                          ┌──────▼───────┐
                                          │  Gemini API  │
                                          │  (card recog)│
                                          └──────────────┘
```

## Development (local, no Docker)

```bash
# Terminal 1: PostgreSQL
docker run --name lorcana-pg -e POSTGRES_USER=lorcana \
  -e POSTGRES_PASSWORD=lorcana -e POSTGRES_DB=lorcana_inventory \
  -p 5434:5432 -d postgres:16-alpine

# Terminal 2: Server
cd server
cp .env.example .env   # edit DATABASE_URL + JWT_SECRET + GEMINI_API_KEY
npm install
npx prisma migrate deploy
npm run seed
npm run dev             # :3001

# Terminal 3: Client
cd client
npm install
npm run dev             # :5173
```

## API Overview

### Auth
| Method | Endpoint              | Description            |
| ------ | --------------------- | ---------------------- |
| POST   | `/api/auth/register`  | Create account         |
| POST   | `/api/auth/login`     | Get JWT token          |

### Cards
| Method | Endpoint              | Description                          |
| ------ | --------------------- | ------------------------------------ |
| GET    | `/api/cards`          | List/search/filter all cards         |
| GET    | `/api/cards/:id`      | Single card details                  |
| GET    | `/api/cards/filters`  | Available filter values              |
| POST   | `/api/cards/recognize`| AI card recognition from base64 image|

### Inventory (authenticated)
| Method | Endpoint               | Description                  |
| ------ | ---------------------- | ---------------------------- |
| GET    | `/api/inventory`       | List user's collection       |
| GET    | `/api/inventory/stats` | Collection statistics        |
| POST   | `/api/inventory`       | Add card to inventory        |
| POST   | `/api/inventory/batch` | Batch add via AI recognition |
| PATCH  | `/api/inventory/:id`   | Update quantity              |
| DELETE | `/api/inventory/:id`   | Remove card                  |

## Production Deployment

```bash
# Build and push Docker images to DockerHub
# (handled automatically by CI on push to main)

# On your server:
git pull
echo "JWT_SECRET=your-secure-secret" > .env
echo "GEMINI_API_KEY=your-key" >> .env
docker compose -f docker-compose.prod.yml up -d
```

Production uses pre-built images from DockerHub (`wongjohnathanwh741/lorcana-server`, `wongjohnathanwh741/lorcana-nginx`).

## CI/CD

GitHub Actions pipeline on every push to `main`:

1. **Type Check** — `tsc --noEmit` on both server and client
2. **Unit Tests** — PostgreSQL service container, migrations, test suites
3. **Build** — Production builds for server + client
4. **Docker Publish** — Builds and pushes images to DockerHub with `latest` and commit-SHA tags

## Project Structure

```
lorcana_management/
├── client/                    # React frontend
│   ├── src/
│   │   ├── components/        # CardGrid, CardDetail, FilterBar, Layout
│   │   ├── pages/             # ScanPage, InventoryPage, DatabasePage, LoginPage
│   │   ├── context/           # AuthContext
│   │   ├── services/          # API client
│   │   └── types/             # TypeScript interfaces
│   └── Dockerfile
├── server/                    # Express backend
│   ├── src/
│   │   ├── routes/            # auth, cards, inventory, sync
│   │   ├── middleware/        # JWT authentication
│   │   └── services/          # cardRecognition (Gemini), cardSync (LorcanaJSON)
│   ├── prisma/
│   │   ├── schema.prisma      # Card, User, InventoryEntry
│   │   ├── migrations/
│   │   └── seed.ts
│   ├── data/
│   │   └── allCards.json      # LorcanaJSON dataset
│   └── Dockerfile
├── nginx/                     # Reverse proxy config + Dockerfile
├── docker-compose.yml         # Dev stack (with Vite HMR)
├── docker-compose.prod.yml    # Production stack (pre-built images)
└── .github/workflows/ci.yml   # CI/CD pipeline
```

## Data Model

- **Card** — Full Lorcana card data (name, color, set, rarity, stats, abilities, image) sourced from LorcanaJSON
- **User** — Username + bcrypt-hashed password, JWT auth
- **InventoryEntry** — Per-user, per-card: `quantity` (normal copies) + `foilQuantity` (foil/enchanted copies), with a unique constraint on `(userId, cardId)`
