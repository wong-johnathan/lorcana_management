import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ProfileForm from "../components/profile/ProfileForm";
import ProfileImageUploader from "../components/profile/ProfileImageUploader";
import UserReferencesEditor from "../components/profile/UserReferencesEditor";
import PublicProfilePanel from "../components/profile/PublicProfilePanel";
import AccountSettingsPanel from "../components/profile/AccountSettingsPanel";
import type { UserProfile, UserReference, PublicUserProfile } from "../types";

const profile: UserProfile = {
  displayName: "Johnathan",
  profileImageUrl: "/api/profile-images/avatar.png",
  profileImageObjectKey: "profile-images/user_1/avatar.png",
  countryOfResidence: "Singapore",
  instagram: "john.cards",
  instagramVisible: true,
  telegram: "johntelegram",
  telegramVisible: true,
  facebook: "https://facebook.com/john",
  facebookVisible: false,
  email: "john@example.com",
  emailVisible: false,
  phoneNumber: "+6599999999",
  phoneNumberVisible: false,
  references: [],
};

const reference: UserReference = {
  id: "ref_1",
  name: "Alice",
  description: "Trade reference",
  contactInfo: "@alice",
  visible: true,
};

describe("profile components", () => {
  it("renders editable optional profile fields and visibility toggles", async () => {
    const onSubmit = vi.fn();
    render(<ProfileForm profile={profile} saving={false} onSubmit={onSubmit} />);

    await userEvent.clear(screen.getByLabelText("Country of residence"));
    await userEvent.type(screen.getByLabelText("Country of residence"), "Singapore");
    await userEvent.click(screen.getByLabelText("Show email publicly"));
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      countryOfResidence: "Singapore",
      email: "john@example.com",
      emailVisible: true,
      phoneNumberVisible: false,
    }));
  });

  it("shows profile image preview controls and submits edited image data", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const file = new File(["fake image"], "avatar.png", { type: "image/png" });
    render(<ProfileImageUploader profileImageUrl={profile.profileImageUrl} uploading={false} onUpload={onUpload} onDelete={vi.fn()} />);

    await userEvent.upload(screen.getByLabelText("Upload profile picture"), file);
    expect(await screen.findByText("Edit profile picture")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Rotate right"));
    await userEvent.click(screen.getByRole("button", { name: "Save picture" }));

    expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({
      contentType: "image/png",
      dataUrl: expect.stringContaining("data:image/png;base64"),
    }));
  });

  it("manages user-provided references with visible/private states", async () => {
    const onCreate = vi.fn();
    const onUpdate = vi.fn();
    const onDelete = vi.fn();
    render(<UserReferencesEditor references={[reference]} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} saving={false} />);

    expect(screen.getByText("User-provided references")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide Alice" }));
    expect(onUpdate).toHaveBeenCalledWith("ref_1", { visible: false });

    await userEvent.type(screen.getByLabelText("Reference name"), "Bob");
    await userEvent.type(screen.getByLabelText("Relationship / description"), "Bought cards before");
    await userEvent.type(screen.getByLabelText("Contact method or note"), "Telegram @bob");
    await userEvent.click(screen.getByLabelText("Show this reference publicly"));
    await userEvent.click(screen.getByRole("button", { name: "Add reference" }));

    expect(onCreate).toHaveBeenCalledWith({
      name: "Bob",
      description: "Bought cards before",
      contactInfo: "Telegram @bob",
      visible: true,
    });
  });

  it("renders public profile without placeholders for hidden or empty fields", () => {
    const publicProfile: PublicUserProfile = {
      displayName: "Johnathan",
      profileImageUrl: "/api/profile-images/avatar.png",
      countryOfResidence: "Singapore",
      instagram: "john.cards",
      telegram: "johntelegram",
      references: [{ id: "ref_1", name: "Alice", description: "Trade reference", contactInfo: "@alice" }],
    };

    render(<PublicProfilePanel profile={publicProfile} username="jw" />);

    expect(screen.getByRole("heading", { name: "Johnathan" })).toBeInTheDocument();
    expect(screen.getByText("Singapore")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://instagram.com/john.cards");
    expect(screen.getByRole("link", { name: "Telegram" })).toHaveAttribute("href", "https://t.me/johntelegram");
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hidden/i)).not.toBeInTheDocument();
  });

  it("covers empty public profile and optional public contact links", () => {
    const { rerender } = render(<PublicProfilePanel profile={{}} username="jw" />);
    expect(screen.getByText("jw has not shared profile information.")).toBeInTheDocument();

    rerender(<PublicProfilePanel profile={{ facebook: "john", email: "john@example.com", phoneNumber: "+6599999999" }} username="jw" />);
    expect(screen.getByRole("heading", { name: "jw" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Facebook" })).toHaveAttribute("href", "https://facebook.com/john");
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:john@example.com");
    expect(screen.getByRole("link", { name: "HP" })).toHaveAttribute("href", "tel:+6599999999");
  });

  it("shows image validation errors, cancels edits, and deletes existing image", async () => {
    const onDelete = vi.fn();
    const onUpload = vi.fn();
    const { rerender } = render(<ProfileImageUploader profileImageUrl={profile.profileImageUrl} uploading={false} onUpload={onUpload} onDelete={onDelete} />);

    await userEvent.upload(screen.getByLabelText("Upload profile picture"), new File(["bad"], "bad.svg", { type: "image/svg+xml" }), { applyAccept: false });
    expect(screen.getByText(/Only JPG, PNG, or WebP/i)).toBeInTheDocument();
    await userEvent.click(screen.getByText("Remove picture"));
    expect(onDelete).toHaveBeenCalled();

    const largeFile = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("Upload profile picture"), largeFile);
    expect(screen.getByText(/5MB or smaller/i)).toBeInTheDocument();

    rerender(<ProfileImageUploader profileImageUrl={null} uploading={false} onUpload={onUpload} onDelete={onDelete} />);
    await userEvent.upload(screen.getByLabelText("Upload profile picture"), new File(["ok"], "avatar.webp", { type: "image/webp" }));
    expect(await screen.findByText("Edit profile picture")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Edit profile picture")).not.toBeInTheDocument();
  });

  it("renders empty references and delete actions", async () => {
    const onDelete = vi.fn();
    const { rerender } = render(<UserReferencesEditor references={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} saving={false} />);
    expect(screen.getByText("No references added.")).toBeInTheDocument();

    rerender(<UserReferencesEditor references={[reference]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} saving={false} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("ref_1");
  });

  it("covers null profile form values, saving labels, and empty file selection", async () => {
    const onSubmit = vi.fn();
    const emptyProfile: UserProfile = {
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
      references: [],
    };

    const { rerender } = render(<ProfileForm profile={emptyProfile} saving={true} onSubmit={onSubmit} />);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByLabelText("Display name")).toHaveValue("");

    rerender(<ProfileForm profile={profile} saving={false} onSubmit={onSubmit} />);
    await userEvent.clear(screen.getByLabelText("Display name"));
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ displayName: null }));

    const onUpload = vi.fn();
    render(<ProfileImageUploader profileImageUrl={null} uploading={true} onUpload={onUpload} onDelete={vi.fn()} />);
    expect(screen.getByText("No photo")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Upload profile picture"), { target: { files: [] } });
    expect(screen.queryByText("Edit profile picture")).not.toBeInTheDocument();
  });

  it("links Google accounts and requires two-step account deletion confirmation", async () => {
    const onLinkGoogle = vi.fn();
    const onDeleteAccount = vi.fn();
    let googleCallback: ((response: { credential?: string }) => void) | null = null;
    const originalGoogle = (window as any).google;
    (window as any).google = {
      accounts: {
        id: {
          initialize: vi.fn((options) => { googleCallback = options.callback; }),
          renderButton: vi.fn((element: HTMLElement) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Link Google account";
            button.onclick = () => googleCallback?.({ credential: "google-link-token" });
            element.appendChild(button);
          }),
        },
      },
    };

    try {
      render(
        <AccountSettingsPanel
          user={{ id: "user_1", username: "jw", authProvider: "LOCAL", googleLinked: false }}
          googleClientId="google-client-id"
          linking={false}
          deleting={false}
          onLinkGoogle={onLinkGoogle}
          onDeleteAccount={onDeleteAccount}
        />
      );

      await act(async () => {
        googleCallback?.({});
      });
      expect(screen.getByText("Google did not return a link credential")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Link Google account" }));
      expect(onLinkGoogle).toHaveBeenCalledWith("google-link-token");

      await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
      expect(screen.getByRole("heading", { name: "Delete account?" })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "I understand, continue" }));
      expect(screen.getByRole("button", { name: "Permanently delete account" })).toBeDisabled();
      await userEvent.type(screen.getByLabelText("Type your username"), "jw");
      await userEvent.type(screen.getByLabelText("Type DELETE"), "DELETE");
      await userEvent.click(screen.getByRole("button", { name: "Permanently delete account" }));
      expect(onDeleteAccount).toHaveBeenCalledWith("jw", "DELETE");
    } finally {
      (window as any).google = originalGoogle;
    }
  });

  it("renders linked and unavailable Google account states", () => {
    const originalGoogle = (window as any).google;
    delete (window as any).google;

    try {
      const { rerender } = render(
        <AccountSettingsPanel
          user={{ id: "user_1", username: "jw", email: "jw@example.com", authProvider: "GOOGLE", googleLinked: true, emailVerifiedAt: "2026-08-28T00:00:00.000Z" }}
          googleClientId="google-client-id"
          linking={false}
          deleting={false}
          onLinkGoogle={vi.fn()}
          onDeleteAccount={vi.fn()}
        />
      );
      expect(screen.getByText("Google linked: jw@example.com")).toBeInTheDocument();
      expect(screen.queryByText("Google not configured")).not.toBeInTheDocument();

      rerender(
        <AccountSettingsPanel
          user={{ id: "user_1", username: "jw", authProvider: "LOCAL", googleLinked: false }}
          googleClientId={null}
          linking={false}
          deleting={false}
          onLinkGoogle={vi.fn()}
          onDeleteAccount={vi.fn()}
        />
      );
      expect(screen.getByText("Google not configured")).toBeInTheDocument();
    } finally {
      (window as any).google = originalGoogle;
    }
  });

  it("loads the Google script when account linking is configured but unavailable", () => {
    const originalGoogle = (window as any).google;
    delete (window as any).google;

    try {
      render(
        <AccountSettingsPanel
          user={{ id: "user_1", username: "jw", authProvider: "LOCAL", googleLinked: false }}
          googleClientId="google-client-id"
          linking={false}
          deleting={false}
          onLinkGoogle={vi.fn()}
          onDeleteAccount={vi.fn()}
        />
      );
      const script = Array.from(document.head.querySelectorAll("script")).find((item) => item.src === "https://accounts.google.com/gsi/client") as HTMLScriptElement;
      expect(script).toBeTruthy();
      fireEvent.error(script);
      expect(screen.getByText("Failed to load Google account linking")).toBeInTheDocument();
    } finally {
      (window as any).google = originalGoogle;
    }
  });
});
