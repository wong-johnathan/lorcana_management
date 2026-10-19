import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import MarketplaceImage from "../components/marketplace/MarketplaceImage";

describe("MarketplaceImage", () => {
  it("renders the static Lorcana logo when there is no source", () => {
    render(<MarketplaceImage src="" alt="Elsa, Snow Queen" hasSource={false} />);
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen" })).toHaveAttribute(
      "src",
      "/lorcana-logo.png"
    );
  });

  it("renders the real src when a source exists", () => {
    render(
      <MarketplaceImage
        src="/api/card-images/card_1"
        alt="Elsa, Snow Queen"
        hasSource
      />
    );
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen" })).toHaveAttribute(
      "src",
      "/api/card-images/card_1"
    );
  });

  it("swaps to the static logo on load error (404 path)", () => {
    render(
      <MarketplaceImage
        src="/api/card-images/card_1"
        alt="Elsa, Snow Queen"
        hasSource
      />
    );
    const img = screen.getByRole("img", { name: "Elsa, Snow Queen" });
    fireEvent.error(img);
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen" })).toHaveAttribute(
      "src",
      "/lorcana-logo.png"
    );
  });

  it("wraps the image in a button when onOpen is provided", async () => {
    const onOpen = vi.fn();
    render(
      <MarketplaceImage
        src="/api/card-images/card_1"
        alt="Elsa, Snow Queen"
        hasSource
        onOpen={onOpen}
      />
    );

    const trigger = screen.getByRole("button", { name: "View Elsa, Snow Queen" });
    await userEvent.click(trigger);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("renders the image directly (no button) when onOpen is absent", () => {
    render(
      <MarketplaceImage
        src="/api/card-images/card_1"
        alt="Elsa, Snow Queen"
        hasSource
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen" })).toBeInTheDocument();
  });
});
