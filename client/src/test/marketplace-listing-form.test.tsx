import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  updatePhotoLabelMock,
} = vi.hoisted(() => ({
  createListingMock: vi.fn(),
  updateListingMock: vi.fn(),
  deleteListingMock: vi.fn(),
  uploadPhotoMock: vi.fn(),
  deletePhotoMock: vi.fn(),
  updatePhotoLabelMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: {
    createListing: createListingMock,
    updateListing: updateListingMock,
    deleteListing: deleteListingMock,
    uploadPhoto: uploadPhotoMock,
    deletePhoto: deletePhotoMock,
    updatePhotoLabel: updatePhotoLabelMock,
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
  inkable: true,
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
    updatePhotoLabelMock.mockReset();
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

  it("renders the 15-photo helper text (AC-POL-14.2)", () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByText(/Up to 15 photos, 5 MiB each/)).toBeInTheDocument();
  });

  it("accepts up to 15 photos and hides the Add photos control at the cap", async () => {
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
      { length: 15 },
      (_, index) => new File(["x"], `photo-${index}.jpg`, { type: "image/jpeg" })
    );
    await userEvent.upload(screen.getByLabelText("Add photos"), files);

    await waitFor(() =>
      expect(screen.queryByLabelText("Add photos")).not.toBeInTheDocument()
    );
  });

  it("rejects the 16th photo with the cap message (AC-POL-14.3)", async () => {
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
      { length: 16 },
      (_, index) => new File(["x"], `photo-${index}.jpg`, { type: "image/jpeg" })
    );
    await userEvent.upload(screen.getByLabelText("Add photos"), files);

    expect(await screen.findByText("Maximum of 15 photos per listing")).toBeInTheDocument();
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

  it("renders the edit-mode card summary with image + variant and premium rarity hint", () => {
    const premiumListing = {
      ...editListing,
      card: { ...card, rarity: "Enchanted" },
      photos: [{ id: "photo_1", url: "https://img.example/p.jpg", sortOrder: 1, label: null }],
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

    // Shared locked-card summary (image + name + set + immutable variant label).
    expect(screen.getByText("Elsa, Snow Queen")).toBeInTheDocument();
    expect(screen.getByText("The First Chapter")).toBeInTheDocument();
    expect(screen.getByText("Normal")).toBeInTheDocument();
    expect(screen.getByText(/Enchanted cards are high-value/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen — condition photo" })).toBeInTheDocument();
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

  it("PATCHes quantity/priceMinor/currency plus condition and location when unlocked", async () => {
    updateListingMock.mockResolvedValue(editListing);
    render(
      <ListingForm
        mode="edit"
        listing={editListing}
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "15" } });
    await userEvent.selectOptions(screen.getByLabelText("Currency"), "EUR");
    await userEvent.selectOptions(screen.getByLabelText("Condition"), "MP");
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Berlin" } });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updateListingMock).toHaveBeenCalledTimes(1));
    expect(updateListingMock).toHaveBeenCalledWith(
      "listing_1",
      expect.objectContaining({
        quantity: 3,
        priceMinor: 1500,
        currency: "EUR",
        condition: "MP",
        location: "Berlin",
      })
    );
  });

  it("includes condition and location in the create POST body (REQ-UX-6)", async () => {
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

    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "12.50" } });
    await userEvent.selectOptions(screen.getByLabelText("Condition"), "LP");
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "  Paris, FR  " } });
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));

    await waitFor(() => expect(createListingMock).toHaveBeenCalledTimes(1));
    expect(createListingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        condition: "LP",
        location: "Paris, FR",
        note: null,
      })
    );
  });

  it("surfaces a photo-remove error and keeps the photo", async () => {
    deletePhotoMock.mockRejectedValue(new Error("Cannot remove photo"));
    const withPhoto = {
      ...editListing,
      photos: [{ id: "photo_1", url: "https://img.example/p.jpg", sortOrder: 1, label: null }],
    };
    render(
      <ListingForm
        mode="edit"
        listing={withPhoto}
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByRole("img", { name: "Elsa, Snow Queen — condition photo" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("Cannot remove photo")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen — condition photo" })).toBeInTheDocument();
  });

  it("removes one pending file while keeping the other in create mode", async () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    const first = new File(["a"], "a.jpg", { type: "image/jpeg" });
    const second = new File(["b"], "b.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Add photos"), [first, second]);

    expect(screen.getByText(/a\.jpg/)).toBeInTheDocument();
    expect(screen.getByText(/b\.jpg/)).toBeInTheDocument();

    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons).toHaveLength(2);
    await userEvent.click(removeButtons[0]);

    expect(screen.queryByText(/a\.jpg/)).not.toBeInTheDocument();
    expect(screen.getByText(/b\.jpg/)).toBeInTheDocument();
  });

  it("renders the TCG price reference under Price and updates on variant change (REQ-POL-11)", async () => {
    const pricedCard = {
      ...card,
      prices: [
        { variant: "Normal", lowPrice: 1.0, midPrice: 2.0, highPrice: 3.0, marketPrice: 2.5, updatedAt: "2026-10-18T00:00:00.000Z" },
        { variant: "Foil", lowPrice: 4.0, midPrice: 5.0, highPrice: 6.0, marketPrice: 5.5, updatedAt: "2026-10-18T00:00:00.000Z" },
      ],
    };
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={[{ ...inventory[0], card: pricedCard }]}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByTestId("tcg-price-reference")).toHaveTextContent("TCG market $2.50");
    await userEvent.selectOptions(screen.getByLabelText("Variant"), "foil");
    expect(screen.getByTestId("tcg-price-reference")).toHaveTextContent("TCG market $5.50");
  });

  it("shows 'No TCG price available' when the card has no price entries", () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByTestId("tcg-price-reference")).toHaveTextContent("No TCG price available");
  });

  it("shows the static Lorcana logo fallback for a no-art card summary (REQ-POL-12)", () => {
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen - Ice Queen" })).toHaveAttribute(
      "src",
      "/lorcana-logo.png"
    );
  });

  it("relabels a saved photo via PATCH (REQ-POL-15)", async () => {
    updatePhotoLabelMock.mockResolvedValue({
      id: "photo_1",
      url: "https://img.example/p.jpg",
      sortOrder: 1,
      label: "Front",
    });
    const withPhoto = {
      ...editListing,
      photos: [{ id: "photo_1", url: "https://img.example/p.jpg", sortOrder: 1, label: null }],
    };
    render(
      <ListingForm
        mode="edit"
        listing={withPhoto}
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    await userEvent.selectOptions(screen.getByLabelText("Photo position"), "Front");
    await waitFor(() =>
      expect(updatePhotoLabelMock).toHaveBeenCalledWith("listing_1", "photo_1", "Front")
    );
  });

  it("assigns a label to a pending file and sends it on upload", async () => {
    createListingMock.mockResolvedValue(editListing);
    uploadPhotoMock.mockResolvedValue({
      id: "photo_1",
      url: "https://img.example/p.jpg",
      sortOrder: 1,
      label: "Back",
    });
    render(
      <ListingForm
        mode="create"
        preselectedCardId="card_1"
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText(/Quantity/), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "10" } });
    await userEvent.upload(
      screen.getByLabelText("Add photos"),
      new File(["x"], "a.jpg", { type: "image/jpeg" })
    );
    await userEvent.selectOptions(screen.getByLabelText("Photo position"), "Back");
    await userEvent.click(screen.getByRole("button", { name: "Create listing" }));

    await waitFor(() => expect(uploadPhotoMock).toHaveBeenCalled());
    expect(uploadPhotoMock).toHaveBeenCalledWith(
      "listing_1",
      expect.objectContaining({ label: "Back" })
    );
  });

  it("opens the carousel at the saved photo's index (no card art) when a thumbnail is clicked (AC-LB-7.1)", async () => {
    const withPhoto = {
      ...editListing,
      photos: [{ id: "photo_1", url: "https://img.example/p.jpg", sortOrder: 1, label: "Front" }],
    };
    render(
      <ListingForm
        mode="edit"
        listing={withPhoto}
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View Elsa, Snow Queen — condition photo (Front)" })
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "Front");
    expect(within(dialog).getByRole("img", { name: "Front" })).toHaveAttribute(
      "src",
      "https://img.example/p.jpg"
    );
    expect(within(dialog).getByText("1 / 1")).toBeInTheDocument();
  });

  it("opens the carousel at index 1 for a saved photo when the card has art (AC-LB-7.1)", async () => {
    const withPhoto = {
      ...editListing,
      card: { ...card, imageUrl: "https://img.example/art.jpg" },
      photos: [{ id: "photo_1", url: "https://img.example/p.jpg", sortOrder: 1, label: null }],
    };
    render(
      <ListingForm
        mode="edit"
        listing={withPhoto}
        inventory={inventory}
        policy={policy}
        onSaved={vi.fn()}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: "View Elsa, Snow Queen — condition photo" })
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "condition photo");
    expect(within(dialog).getByText("2 / 2")).toBeInTheDocument();

    // Previous navigates to the card art (full set = card art + saved photo).
    await userEvent.click(within(dialog).getByRole("button", { name: "Previous image" }));
    expect(
      within(dialog).getByRole("img", { name: "Elsa, Snow Queen · The First Chapter · 1/204" })
    ).toHaveAttribute("src", "/api/card-images/card_1");
  });
});
