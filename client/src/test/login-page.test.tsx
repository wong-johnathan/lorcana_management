import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "../pages/LoginPage";

const authMock = vi.hoisted(() => ({
  loginWithGoogle: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  googleClientId: "google-client-id",
  registrationEnabled: true,
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => authMock,
}));

describe("LoginPage", () => {
  beforeEach(() => {
    authMock.loginWithGoogle.mockReset();
    authMock.login.mockReset();
    authMock.register.mockReset();
    authMock.googleClientId = "google-client-id";
    authMock.registrationEnabled = true;
    document.body.innerHTML = "";
    delete (window as any).google;
  });

  it("renders Google sign-in as the primary auth path and submits the credential", async () => {
    const renderButton = vi.fn((_el: HTMLElement, _options: unknown) => undefined);
    const initialize = vi.fn((options: { callback: (response: { credential?: string }) => void }) => {
      options.callback({ credential: "google-id-token" });
    });
    (window as any).google = { accounts: { id: { initialize, renderButton } } };

    render(<LoginPage />);

    await waitFor(() => expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: "google-client-id" })));
    expect(renderButton).toHaveBeenCalled();
    expect(screen.getByText("Marketplace access requires a verified Google email.")).toBeInTheDocument();
    await waitFor(() => expect(authMock.loginWithGoogle).toHaveBeenCalledWith("google-id-token"));
  });

  it("keeps password login as a secondary legacy path", async () => {
    render(<LoginPage />);

    await userEvent.click(screen.getByRole("button", { name: "Use password login" }));
    await userEvent.type(screen.getByLabelText("Username"), "JW");
    await userEvent.type(screen.getByLabelText("Password"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: "Sign In" }));

    expect(authMock.login).toHaveBeenCalledWith("JW", "secret1");
  });
});
