import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { auth as authApi } from "../services/api";

vi.mock("../services/api", () => ({
  auth: {
    config: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    googleLogin: vi.fn(),
  },
}));

function makeJwt(expSeconds: number) {
  const payload = btoa(JSON.stringify({ exp: expSeconds }));
  return `header.${payload}.sig`;
}

function Harness() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="loading">{String(auth.isLoading)}</div>
      <div data-testid="user">{auth.user?.username ?? "none"}</div>
      <div data-testid="token">{auth.token ?? "none"}</div>
      <div data-testid="registration">{String(auth.registrationEnabled)}</div>
      <div data-testid="google-client-id">{auth.googleClientId ?? "none"}</div>
      <button onClick={() => auth.login("jw", "secret")}>login</button>
      <button onClick={() => auth.register("alice", "secret")}>register</button>
      <button onClick={() => auth.loginWithGoogle("google-id-token")}>google</button>
      <button onClick={auth.logout}>logout</button>
    </div>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.mocked(authApi.config).mockResolvedValue({ registrationEnabled: false, googleClientId: "google-client-id" });
    vi.mocked(authApi.login).mockResolvedValue({ token: "login-token", user: { id: "u1", username: "jw" } });
    vi.mocked(authApi.register).mockResolvedValue({ token: "register-token", user: { id: "u2", username: "alice" } });
    vi.mocked(authApi.googleLogin).mockResolvedValue({ token: "google-token", user: { id: "u3", username: "google", emailVerifiedAt: "2026-08-28T00:00:00.000Z" } });
  });

  it("loads saved non-expired sessions and registration config", async () => {
    localStorage.setItem("token", makeJwt(Math.floor(Date.now() / 1000) + 60));
    localStorage.setItem("user", JSON.stringify({ id: "u0", username: "saved" }));
    render(<AuthProvider><Harness /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("saved");
    expect(screen.getByTestId("registration")).toHaveTextContent("false");
    expect(screen.getByTestId("google-client-id")).toHaveTextContent("google-client-id");
  });

  it("clears expired or malformed saved sessions", async () => {
    localStorage.setItem("token", makeJwt(Math.floor(Date.now() / 1000) - 60));
    localStorage.setItem("user", JSON.stringify({ id: "u0", username: "saved" }));
    render(<AuthProvider><Harness /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(localStorage.getItem("token")).toBeNull();
  });

  it("logs in, registers, logs out, and reacts to auth:expired", async () => {
    render(<AuthProvider><Harness /></AuthProvider>);
    await userEvent.click(screen.getByRole("button", { name: "login" }));
    expect(screen.getByTestId("user")).toHaveTextContent("jw");
    expect(localStorage.getItem("token")).toBe("login-token");

    await userEvent.click(screen.getByRole("button", { name: "register" }));
    expect(screen.getByTestId("user")).toHaveTextContent("alice");

    await userEvent.click(screen.getByRole("button", { name: "google" }));
    expect(screen.getByTestId("user")).toHaveTextContent("google");
    expect(localStorage.getItem("token")).toBe("google-token");

    act(() => window.dispatchEvent(new CustomEvent("auth:expired")));
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("none"));

    await userEvent.click(screen.getByRole("button", { name: "logout" }));
    expect(screen.getByTestId("token")).toHaveTextContent("none");
  });

  it("throws when useAuth is used outside provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Harness />)).toThrow("useAuth must be used within AuthProvider");
  });
});
