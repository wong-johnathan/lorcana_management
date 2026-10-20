import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import SettingsPage from "../pages/SettingsPage";
import { copyTextToClipboard } from "../utils/clipboard";

const {
  settingsGetMock,
  profileGetMock,
  getPolicyMock,
  getTransactionsMock,
} = vi.hoisted(() => ({
  settingsGetMock: vi.fn(),
  profileGetMock: vi.fn(),
  getPolicyMock: vi.fn(),
  getTransactionsMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  settings: { get: settingsGetMock, update: vi.fn() },
  profile: {
    get: profileGetMock,
    update: vi.fn(),
    uploadPhoto: vi.fn(),
    deletePhoto: vi.fn(),
  },
  inventory: { getPolicy: getPolicyMock, updatePolicy: vi.fn() },
  marketplace: { getTransactions: getTransactionsMock },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const CURRENT_USER_ID = "buyer_1";
const EXPECTED_SHARE_URL = `http://localhost/marketplace/seller/${CURRENT_USER_ID}`;

const PROFILE = {
  displayName: null,
  profileImageUrl: null,
  profileImageObjectKey: null,
  countryOfResidence: null,
  instagram: null,
  instagramVisible: false,
  telegram: null,
  telegramVisible: false,
  facebook: null,
  facebookVisible: false,
  email: null,
  emailVisible: false,
  phoneNumber: null,
  phoneNumberVisible: false,
};

const TRANSACTION = {
  id: "tx_1",
  enquiryId: "enq_1",
  listingId: "listing_1",
  buyerId: CURRENT_USER_ID,
  sellerId: "seller_1",
  cardId: "card_1",
  variant: "normal",
  quantity: 2,
  priceMinor: 1000,
  currency: "USD",
  status: "COMPLETED",
  completedCause: null,
  cancelledBy: null,
  soldAt: "2026-10-18T00:00:00.000Z",
  confirmedAt: "2026-10-18T00:01:00.000Z",
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:01:00.000Z",
  buyer: { id: CURRENT_USER_ID, username: "bob" },
  seller: { id: "seller_1", username: "alice" },
  card: { id: "card_1", name: "Elsa, Snow Queen", setName: "The First Chapter" },
};

function renderSettings({ publicEnabled = false } = {}) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: CURRENT_USER_ID,
      username: "bob",
      email: "bob@example.com",
      emailVerifiedAt: "2026-08-28T00:00:00.000Z",
      authProvider: "LOCAL",
      googleLinked: false,
    },
    googleClientId: null,
    linkGoogleAccount: vi.fn(),
    deleteAccount: vi.fn(),
  } as never);

  settingsGetMock.mockResolvedValue({ publicEnabled, publicUrl: `/collection/${CURRENT_USER_ID}` });
  profileGetMock.mockResolvedValue(PROFILE);
  getPolicyMock.mockResolvedValue({ keepNormalQuantity: 4, keepFoilQuantity: 1, keepHolofoilQuantity: 1 });
  getTransactionsMock.mockResolvedValue({ transactions: [TRANSACTION] });

  return render(
    <MemoryRouter initialEntries={["/profile"]}>
      <SettingsPage />
    </MemoryRouter>
  );
}

function stubClipboard(writeText: () => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  });
  return vi.mocked(navigator.clipboard.writeText);
}

function stubExecCommand(result: boolean) {
  const execCommand = vi.fn().mockReturnValue(result);
  Object.defineProperty(document, "execCommand", { value: execCommand, writable: true, configurable: true });
  return execCommand;
}

/**
 * Fallback stub that records the payload handed to the legacy technique: the
 * helper appends a temporary `<input>` carrying the text and calls
 * `document.execCommand("copy")`, so the value read inside the stub is exactly
 * what the browser would put on the clipboard.
 */
function stubExecCommandCapturing(result: boolean) {
  const captured: { value: string; input: HTMLInputElement }[] = [];
  const execCommand = vi.fn(() => {
    const inputs = Array.from(document.body.querySelectorAll("input"));
    const input = inputs[inputs.length - 1];
    if (input) captured.push({ value: input.value, input });
    return result;
  });
  Object.defineProperty(document, "execCommand", { value: execCommand, writable: true, configurable: true });
  return { execCommand, captured };
}

afterEach(() => {
  delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  delete (document as unknown as { execCommand?: unknown }).execCommand;
});

describe("SettingsPage share profile (REQ-SHP-1)", () => {
  beforeEach(() => {
    settingsGetMock.mockReset();
    profileGetMock.mockReset();
    getPolicyMock.mockReset();
    getTransactionsMock.mockReset();
  });

  it("renders an accessible header button described by the helper line (AC-SHP-1.1/1.7)", async () => {
    renderSettings();

    const button = await screen.findByRole("button", { name: "Share profile" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("focus-visible:ring");

    const helperId = button.getAttribute("aria-describedby");
    expect(helperId).toBeTruthy();
    const helper = document.getElementById(helperId as string);
    expect(helper).toHaveTextContent("Anyone with the link can view your public seller page.");

    const heading = screen.getByRole("heading", { name: "Profile Settings" });
    expect(heading.parentElement).toContainElement(button);
  });

  it("is keyboard operable and copies the seller-profile URL from user.id (AC-SHP-1.1/1.2)", async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard(() => Promise.resolve());

    renderSettings();
    const button = await screen.findByRole("button", { name: "Share profile" });

    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(writeText).toHaveBeenCalledWith(EXPECTED_SHARE_URL);
    expect(writeText).toHaveBeenCalledWith("http://localhost/marketplace/seller/buyer_1");
    expect(writeText).not.toHaveBeenCalledWith("http://localhost/collection/buyer_1");
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });

  it("falls back to document.execCommand when the Clipboard API is absent and copies the exact share URL (AC-SHP-1.3)", async () => {
    const { execCommand, captured } = stubExecCommandCapturing(true);

    renderSettings();
    const button = await screen.findByRole("button", { name: "Share profile" });
    fireEvent.click(button);

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(captured).toHaveLength(1);
    expect(captured[0].value).toBe(EXPECTED_SHARE_URL);
    expect(captured[0].value).toBe("http://localhost/marketplace/seller/buyer_1");
    expect(document.body.contains(captured[0].input)).toBe(false);
    expect(screen.queryByText(/Couldn’t copy the link/)).not.toBeInTheDocument();
  });

  it("falls back to document.execCommand when writeText rejects (AC-SHP-1.3)", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    const execCommand = stubExecCommand(true);

    renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: "Share profile" }));

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("shows an inline, selectable-URL failure message when both clipboard paths fail (AC-SHP-1.4)", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    const execCommand = stubExecCommand(false);

    renderSettings();
    const button = await screen.findByRole("button", { name: "Share profile" });
    fireEvent.click(button);

    expect(await screen.findByText("Couldn’t copy the link. Copy it from here:")).toBeInTheDocument();
    expect(screen.getByText(EXPECTED_SHARE_URL)).toHaveClass("font-mono");
    expect(screen.getByRole("status")).toHaveTextContent("Couldn’t copy the link.");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(screen.getByRole("button", { name: "Share profile" })).toBeInTheDocument();
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });

  it("announces a successful copy and reverts the label after ~2s (AC-SHP-1.4)", async () => {
    stubClipboard(() => Promise.resolve());

    renderSettings();
    const button = await screen.findByRole("button", { name: "Share profile" });

    vi.useFakeTimers();
    try {
      fireEvent.click(button);
      await act(async () => {
        await Promise.resolve();
      });

      expect(button).toHaveTextContent("Copied!");
      expect(screen.getByRole("status")).toHaveTextContent("Profile link copied to clipboard.");
      expect(screen.queryByText(/Couldn’t copy the link/)).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1999);
      });
      expect(button).toHaveTextContent("Copied!");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(button).toHaveTextContent("Share profile");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not navigate, reload or issue a request (AC-SHP-1.5)", async () => {
    stubClipboard(() => Promise.resolve());

    renderSettings();
    const button = await screen.findByRole("button", { name: "Share profile" });
    const hrefBefore = window.location.href;

    fireEvent.click(button);
    expect(await screen.findByText("Copied!")).toBeInTheDocument();

    expect(getTransactionsMock).toHaveBeenCalledTimes(1);
    expect(settingsGetMock).toHaveBeenCalledTimes(1);
    expect(profileGetMock).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(hrefBefore);
    expect(window.location.pathname).toBe("/");
  });

  it("renders regardless of the public collection being disabled (AC-SHP-1.6)", async () => {
    stubClipboard(() => Promise.resolve());

    renderSettings({ publicEnabled: false });

    expect(await screen.findByRole("button", { name: "Share profile" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Share profile" }));
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });

  it("is distinct from the Public Collection Copy link control (AC-SHP-1.7)", async () => {
    renderSettings({ publicEnabled: true });

    const shareButton = await screen.findByRole("button", { name: "Share profile" });
    const collectionCopy = screen.getByRole("button", { name: "Copy link" });

    expect(shareButton).not.toBe(collectionCopy);
    const collectionPanel = collectionCopy.closest("div.bg-gray-900");
    expect(collectionPanel).not.toBeNull();
    expect(collectionPanel).not.toContainElement(shareButton);
    expect(screen.getByText("Public Collection")).toBeInTheDocument();
  });
});

describe("copyTextToClipboard", () => {
  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = stubClipboard(() => Promise.resolve());

    await expect(copyTextToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back when the clipboard object has no writeText", async () => {
    Object.defineProperty(navigator, "clipboard", { value: {}, configurable: true });
    const execCommand = stubExecCommand(true);

    await expect(copyTextToClipboard("hello")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("puts the exact payload on the fallback input, including non-ASCII characters (AC-SHP-1.3)", async () => {
    const payload = "https://localhost/marketplace/seller/\u00fcn\u00efcode-\u2713";
    Object.defineProperty(navigator, "clipboard", { value: {}, configurable: true });
    const { execCommand, captured } = stubExecCommandCapturing(true);

    await expect(copyTextToClipboard(payload)).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledTimes(1);
    expect(captured).toHaveLength(1);
    // Byte-identical: same UTF-16 code units and the same UTF-8 bytes
    // (ü = C3 BC, ï = C3 AF, ✓ = E2 9C 93) as the input string.
    expect(captured[0].value).toBe(payload);
    expect(encodeURIComponent(captured[0].value)).toBe(
      "https%3A%2F%2Flocalhost%2Fmarketplace%2Fseller%2F%C3%BCn%C3%AFcode-%E2%9C%93"
    );
    expect(document.body.contains(captured[0].input)).toBe(false);
  });

  it("returns false and never throws when the fallback cannot run", async () => {
    vi.spyOn(document, "createElement").mockImplementation(() => {
      throw new Error("no input element");
    });
    stubExecCommand(true);

    await expect(copyTextToClipboard("hello")).resolves.toBe(false);
  });
});

describe("share profile failure accessibility", () => {
  beforeEach(() => {
    settingsGetMock.mockReset();
    profileGetMock.mockReset();
    getPolicyMock.mockReset();
    getTransactionsMock.mockReset();
  });

  it("keeps the failure message in flow after a retry that succeeds (UX-D11)", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));
    const execCommand = stubExecCommand(false);

    renderSettings();
    const button = await screen.findByRole("button", { name: "Share profile" });
    fireEvent.click(button);
    expect(await screen.findByText("Couldn’t copy the link. Copy it from here:")).toBeInTheDocument();

    execCommand.mockReturnValue(true);
    fireEvent.click(button);

    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(screen.queryByText("Couldn’t copy the link. Copy it from here:")).not.toBeInTheDocument();
    expect(within(document.body).getByText("Profile link copied to clipboard.")).toBeInTheDocument();
  });
});
