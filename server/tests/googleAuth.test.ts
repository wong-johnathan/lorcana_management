import { describe, expect, it, vi } from "vitest";

const googleMocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn(function OAuth2Client() {
    return { verifyIdToken: googleMocks.verifyIdToken };
  }),
}));

import { verifyGoogleCredential } from "../src/services/googleAuth.js";

describe("google auth service", () => {
  it("maps verified Google ID token payloads", async () => {
    googleMocks.verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: "sub_1", email: "jw@example.com", email_verified: true, name: "John" }),
    });

    await expect(verifyGoogleCredential("credential", "client-id")).resolves.toEqual({
      sub: "sub_1",
      email: "jw@example.com",
      emailVerified: true,
      name: "John",
    });
    expect(googleMocks.verifyIdToken).toHaveBeenCalledWith({ idToken: "credential", audience: "client-id" });
  });

  it("rejects Google tokens missing required identity fields", async () => {
    googleMocks.verifyIdToken.mockResolvedValueOnce({ getPayload: () => ({ email: "jw@example.com" }) });
    await expect(verifyGoogleCredential("credential", "client-id")).rejects.toThrow("Google account id missing");

    googleMocks.verifyIdToken.mockResolvedValueOnce({ getPayload: () => ({ sub: "sub_1" }) });
    await expect(verifyGoogleCredential("credential", "client-id")).rejects.toThrow("Google email missing");
  });
});
