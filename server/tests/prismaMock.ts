import { vi } from "vitest";

export const prismaMock = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  card: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
  cardPrice: {
    upsert: vi.fn(),
    findMany: vi.fn(),
  },
  cardAnalysis: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  inventoryEntry: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
};

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(function PrismaClient() {
    return prismaMock;
  }),
}));

export function resetPrismaMock() {
  for (const model of Object.values(prismaMock)) {
    for (const fn of Object.values(model)) {
      if (typeof fn === "function" && "mockReset" in fn) fn.mockReset();
    }
  }
}
