import { OAuth2Client } from "google-auth-library";

export interface VerifiedGoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
}

export async function verifyGoogleCredential(
  credential: string,
  clientId: string
): Promise<VerifiedGoogleIdentity> {
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error("Google account id missing");
  if (!payload.email) throw new Error("Google email missing");

  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name ?? null,
  };
}
