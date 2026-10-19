import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import ListingImageCarousel from "../components/marketplace/ListingImageCarousel";
import type { ListingImageItem } from "../utils/listingImages";

const images: ListingImageItem[] = [
  {
    src: "https://img.example/art.jpg",
    caption: "Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1",
  },
  { src: "https://img.example/front.jpg", caption: "Front" },
  { src: "https://img.example/back.jpg", caption: "condition photo" },
];

function Harness({
  startIndex = 0,
  items = images,
}: {
  startIndex?: number;
  items?: ListingImageItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <ListingImageCarousel
          images={items}
          startIndex={startIndex}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

describe("ListingImageCarousel", () => {
  it("renders the startIndex item with its caption, indicator, and dialog a11y", async () => {
    render(<Harness startIndex={1} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Front");
    expect(screen.getByRole("img", { name: "Front" })).toHaveAttribute(
      "src",
      "https://img.example/front.jpg"
    );
    expect(screen.getByText("Front")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("navigates prev/next via the arrow buttons, updating the indicator and caption", async () => {
    render(<Harness startIndex={1} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    await userEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img", { name: "condition photo" })).toHaveAttribute(
      "src",
      "https://img.example/back.jpg"
    );
    expect(screen.getByText("3 / 3")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Previous image" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous image" }));
    expect(screen.getByRole("img", { name: "Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1" }))
      .toHaveAttribute("src", "https://img.example/art.jpg");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("navigates with the ArrowLeft/ArrowRight keys and closes on Escape", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Front" })).toBeInTheDocument();

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("stays open on a non-Escape/non-arrow key", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    await userEvent.keyboard("{a}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("disables prev at the first image and next at the last (non-wrapping)", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByRole("button", { name: "Previous image" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next image" })).not.toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next image" }));
    await userEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next image" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous image" })).not.toBeDisabled();
  });

  it("shows 1 / 1 with both arrows disabled for a single image", async () => {
    render(<Harness items={[images[0]]} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous image" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next image" })).toBeDisabled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on the × button", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes on backdrop click", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("dialog"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("does not close when the image or an arrow button is clicked (stopPropagation)", async () => {
    render(<Harness startIndex={0} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("img", { name: "Elsa, Snow Queen · The First Chapter · 1/204 • EN • 1" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Arrow click navigates but must not close.
    fireEvent.click(within(dialog).getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("returns focus to the trigger on close", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("clamps an out-of-range startIndex to a valid image", async () => {
    render(<Harness startIndex={99} />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("img", { name: "condition photo" })).toBeInTheDocument();
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
  });

  it("renders null when the image list is empty", () => {
    render(<ListingImageCarousel images={[]} startIndex={0} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
