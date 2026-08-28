import { Response } from "express";

export const VERIFIED_EMAIL_REQUIRED = "Verified email required";

export async function userHasVerifiedEmail(prisma: any, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, emailVerifiedAt: true },
  });
  return Boolean(user?.emailVerifiedAt);
}

export async function requireVerifiedEmailForAction(
  prisma: any,
  userId: string,
  res: Response,
  message = VERIFIED_EMAIL_REQUIRED
): Promise<boolean> {
  if (await userHasVerifiedEmail(prisma, userId)) return true;
  res.status(403).json({ error: message });
  return false;
}
