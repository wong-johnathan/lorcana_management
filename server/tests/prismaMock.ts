import { vi } from "vitest";

export const prismaMock = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  userProfile: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  userReference: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  userInventoryPolicy: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  cardRetentionOverride: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  extraForSaleListing: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  marketplaceEnquiry: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  enquiryMessage: {
    create: vi.fn(),
  },
  enquiryOffer: {
    create: vi.fn(),
  },
  marketplaceReservation: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  notification: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  fxRate: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  emailVerificationToken: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  passwordResetToken: {
    create: vi.fn(),
    findFirst: vi.fn(),
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
  marketplaceTransaction: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  marketplaceReservation: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  marketplaceReview: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  marketplaceReviewTag: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  marketplaceReport: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  userBlock: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
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
