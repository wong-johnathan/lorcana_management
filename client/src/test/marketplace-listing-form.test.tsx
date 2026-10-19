import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ListingForm from "../components/marketplace/ListingForm";
import type { InventoryEntry, InventoryPolicy } from "../types";

const {
  createListingMock,
  updateListingMock,
  deleteListingMock,
  uploadPhotoMock,
  deletePhotoMock,
} = vi.hoisted(() => ({
  createListingMock: vi.fn(),
  updateListingMock: vi.fn(),
  deleteListingMock: vi.fn(),
  uploadPhotoMock: vi.fn(),
  deletePhotoMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: {
    createListing: createListingMock,
    updateListing: updateListingMock,
    deleteListing: deleteListingMock,
    uploadPhoto: uploadPhotoMock,
    deletePhoto: deletePhotoMock,
  },
}));

const card = {
  id: "card_1",
  externalId: 1,
  tcgPlayerId: null,
  cardTraderUrl: null,
  cardmarketUrl: null,
  name: "Elsa, Snow Queen",
  subtitle: "Ice Queen",
  character: "Elsa",
  types: ["Hero"],
  cardType: "Character",
  color: "Amethyst",
  setCode: "TFC",
  setName: "The First Chapter",
  rarity: "Legendary",
  inkCost: 5,
  strength: 3,
  willpower: 3,
  lore: 2,
  abilities: "Evasive",
  cardNumber: "1/204",
  foilTypes: ["None", "Silver"],
  imageUrl: "",
  prices: [],
};

const inventory: InventoryEntry[] = [
  {
    id: "inv_1",
    userId: "u1",
    cardId: "card_1",
    quantity: 3,
    foilQuantity: 5,
    holofoilQuantity: 0,
    card,
  },
];

const policy: InventoryPolicy = {
  keepNormalQuantity: 4,
  keepFoilQuantity: 1,
  keepHolofoilQuantity: 1,
};

const editListing = {
  id: "listing_1",
  sellerId: "u1",
  cardId: "card_1",
  variant: "normal",
  quantity: 2,
  priceMinor: 2500,
  currency: "USD",
  condition: "NM",
  location: "London",
  note: "nice",
  status: "ACTIVE",
  hiddenAt: null,
  createdAt: "2026-10-18T00:00:00.000Z",
  updatedAt: "2026-10-18T00:00:00.000Z",
  card,
  seller: { id: "u1", username: "alice", profile: {} },
  photos: [],
};

describe("ListingForm", () => {
  beforeEach(() => {
    createListingMock.mockReset();
    updateListingMock.mockReset();
    deleteListingMock.mockReset();
    uploadPhotoMock.mockReset();
    deletePhotoMock.mockReset();
  });

  it("offers variant, condition, and currency dropdowns with the preselected card", async () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    // Condition + currency options are always present.
    expect(screen.getByRole("option", { name: "Near Mint (NM)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Lightly Played (LP)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Moderately Played (MP)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Heavily Played (HP)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "USD" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "EUR" })).toBeInTheDocument();

    // Variants are constrained to the selected card's foil types.
    expect(screen.getByRole("option", { name: "Normal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Foil" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Holofoil" })).not.toBeInTheDocument();
  });

  it("shows a locked-card summary with name and set, and no card <select>", () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByText("The First Chapter")).toBeInTheDocument();
    expect(screen.queryByLabelText("Card")).not.toBeInTheDocument();
  });

  it("defaults the variant to the first available variant (holofoil-only card)", () => {
    const holoCard = { ...card, id: "card_holo", foilTypes: ["Lava"] };
    const holoInventory: InventoryEntry[] = [
      {
        id: "inv_holo",
        userId: "u1",
        cardId: "card_holo",
        quantity: 0,
        foilQuantity: 0,
        holofoilQuantity: 3,
        card: holoCard,
      },
    ];

    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_holo"
        inventory={holoInventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Variant")).toHaveValue("holofoil");
    expect(screen.queryByRole("option", { name: "Normal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Foil" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Holofoil" })).toBeInTheDocument();
  });

  it("renders a Back button that calls onBack", async () => {
    const onBack = vi.fn();
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onBack={onBack}
        onSaved={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("caps quantity at the owned count and rejects the overshoot (AC-4.x)", async () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "10" } });
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));

    expect(await screen.findByText(/You can only list up to 3/)).toBeInTheDocument();
    expect(createListingMock).not.toHaveBeenCalled();
  });

  it("submits a valid quantity within the owned cap", async () => {
    createListingMock.mockResolvedValue(editListing);
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "10" } });
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));

    await waitFor(() => expect(createListingMock).toHaveBeenCalledTimes(1));
    expect(createListingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: "card_1",
        variant: "normal",
        quantity: 3,
        priceMinor: 1000,
        currency: "USD",
      })
    );
  });

  it("shows a surplus hint when owned exceeds the keep policy (REQ-5)", async () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    await userEvent.selectOptions(screen.getByLabelText("Variant"), "foil");

    expect(
      await screen.findByText(/You have 4 surplus Foil copies/)
    ).toBeInTheDocument();
  });

  it("rejects a photo larger than 5 MiB before upload (AC-23.x)", async () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.jpg", {
      type: "image/jpeg",
    });
    await userEvent.upload(screen.getByLabelText("Add photos"), big);

    expect(
      await screen.findByText("Image is too large (max 5 MiB)")
    ).toBeInTheDocument();
    expect(uploadPhotoMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported photo MIME type (AC-23.x)", async () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    const gif = new File(["GIF89a"], "anim.gif", { type: "image/gif" });
    // fireEvent.change bypasses the input's `accept` filter so the MIME check is
    // actually exercised (userEvent.upload silently drops non-accepted types).
    fireEvent.change(screen.getByLabelText("Add photos"), { target: { files: [gif] } });

    expect(
      await screen.findByText("Unsupported image type (use JPEG, PNG, or WebP)")
    ).toBeInTheDocument();
    expect(uploadPhotoMock).not.toHaveBeenCalled();
  });

  it("caps the photo count at 8 (AC-23.x)", async () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    const files = Array.from(
      { length: 8 },
      (_, index) => new File(["x"], `photo-${index}.jpg`, { type: "image/jpeg" })
    );
    await userEvent.upload(screen.getByLabelText("Add photos"), files);

    await waitFor(() =>
      expect(screen.queryByLabelText("Add photos")).not.toBeInTheDocument()
    );
  });

  it("locks price/currency/quantity while a pending transaction exists (REQ-8)", () => {
    render(
      <ListingForm
        mode="edit"
        listing={editListing}
        locked
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
        onDeleted={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/Quantity/)).toBeDisabled();
    expect(screen.getByLabelText("Currency")).toBeDisabled();
    expect(screen.getByLabelText("Price")).toBeDisabled();
    expect(screen.getByLabelText("Condition")).not.toBeDisabled();
    expect(screen.getByLabelText("Location")).not.toBeDisabled();
    expect(screen.getByLabelText("Note")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete listing" })).toBeDisabled();
  });

  it("omits price/currency/quantity from the PATCH when locked (REQ-8)", async () => {
    updateListingMock.mockResolvedValue(editListing);
    render(
      <ListingForm
        mode="edit"
        listing={editListing}
        locked
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "updated note" } });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateListingMock).toHaveBeenCalledTimes(1));
    const body = updateListingMock.mock.calls[0][1] as Record<string, unknown>;
    expect(body.note).toBe("updated note");
    expect(body).not.toHaveProperty("quantity");
    expect(body).not.toHaveProperty("priceMinor");
    expect(body).not.toHaveProperty("currency");
  });

  it("renders the edit-mode card summary and premium rarity hint", () => {
    const premiumListing = {
      ...editListing,
      card: { ...card, rarity: "Enchanted" },
      photos: [{ id: "photo_1", url: "https://img.example/p.jpg", sortOrder: 1 }],
    };
    render(
      <ListingForm
        mode="edit"
        listing={premiumListing}
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByText("Card:")).toBeInTheDocument();
    expect(screen.getByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByText(/Enchanted cards are high-value/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Uploaded condition photo" })).toBeInTheDocument();
  });

  it("shows an owned-copy hint with singular/plural phrasing", () => {
    const { rerender } = render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByText(/You own 3 Normal copies/)).toBeInTheDocument();

    rerender(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={[{ ...inventory[0], quantity: 1, foilQuantity: 0, holofoilQuantity: 0 }]}
        policy={policy}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByText(/You own 1 Normal copy/)).toBeInTheDocument();
  });

  it("requires a card before creating", async () => {
    render(<ListingForm mode="create" inventory={[]} policy={policy} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));
    expect(await screen.findByText("Select a card to list")).toBeInTheDocument();
  });

  it("requires a valid price before creating", async () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));
    expect(await screen.findByText("Enter a valid price")).toBeInTheDocument();
  });

  it("uploads buffered photos after a successful create", async () => {
    createListingMock.mockResolvedValue(editListing);
    uploadPhotoMock.mockResolvedValue({ id: "photo_1", url: "https://img.example/p.jpg", sortOrder: 1 });
    const onSaved = vi.fn();
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={onSaved}
      />
    );

    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "10" } });
    await userEvent.upload(
      screen.getByLabelText("Add photos"),
      new File(["x"], "a.jpg", { type: "image/jpeg" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));

    await waitFor(() => expect(createListingMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(uploadPhotoMock).toHaveBeenCalled());
    expect(onSaved).toHaveBeenCalled();
  });

  it("surfaces a create error without calling onSaved", async () => {
    createListingMock.mockRejectedValue(new Error("Listing limit reached"));
    const onSaved = vi.fn();
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={onSaved}
      />
    );

    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "10" } });
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));

    expect(await screen.findByText("Listing limit reached")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("uploads photos immediately in edit mode and removes them", async () => {
    updateListingMock.mockResolvedValue(editListing);
    uploadPhotoMock.mockResolvedValue({ id: "photo_1", url: "https://img.example/p.jpg", sortOrder: 1 });
    deletePhotoMock.mockResolvedValue(undefined);
    render(
      <ListingForm
        mode="edit"
        listing={editListing}
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    await userEvent.upload(
      screen.getByLabelText("Add photos"),
      new File(["x"], "a.jpg", { type: "image/jpeg" })
    );
    await waitFor(() => expect(uploadPhotoMock).toHaveBeenCalledWith("listing_1", expect.any(Object)));
    expect(await screen.findByText("Saved photo")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(deletePhotoMock).toHaveBeenCalledWith("listing_1", "photo_1"));
  });

  it("surfaces a photo upload error in edit mode", async () => {
    uploadPhotoMock.mockRejectedValue(new Error("Upload failed"));
    render(
      <ListingForm
        mode="edit"
        listing={editListing}
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    await userEvent.upload(
      screen.getByLabelText("Add photos"),
      new File(["x"], "a.jpg", { type: "image/jpeg" })
    );
    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
  });

  it("deletes the listing and invokes onDeleted", async () => {
    deleteListingMock.mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    render(
      <ListingForm
        mode="edit"
        listing={editListing}
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
        onDeleted={onDeleted}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete listing" }));
    await waitFor(() => expect(deleteListingMock).toHaveBeenCalledWith("listing_1"));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("surfaces a delete error and keeps the form usable", async () => {
    deleteListingMock.mockRejectedValue(new Error("Cannot delete"));
    const onDeleted = vi.fn();
    render(
      <ListingForm
        mode="edit"
        listing={editListing}
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
        onDeleted={onDeleted}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete listing" }));
    expect(await screen.findByText("Cannot delete")).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("renders a cancel button that calls onCancel", async () => {
    const onCancel = vi.fn();
    render(
      <ListingForm
        mode="edit"
        listing={editListing}
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
        onCancel={onCancel}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
