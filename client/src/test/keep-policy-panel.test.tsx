import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import KeepPolicyPanel from "../components/inventory/KeepPolicyPanel";
import type { InventoryPolicy } from "../types";

const policy: InventoryPolicy = {
  keepNormalQuantity: 4,
  keepFoilQuantity: 1,
  keepHolofoilQuantity: 1,
};

describe("KeepPolicyPanel", () => {
  it("renders the current keep counts and saves edited values", async () => {
    const onSave = vi.fn();
    render(<KeepPolicyPanel policy={policy} onSave={onSave} />);

    expect(screen.getByLabelText("Keep normal")).toHaveValue(4);
    expect(screen.getByLabelText("Keep foil")).toHaveValue(1);
    expect(screen.getByLabelText("Keep holofoil")).toHaveValue(1);

    await userEvent.clear(screen.getByLabelText("Keep normal"));
    await userEvent.type(screen.getByLabelText("Keep normal"), "8");
    await userEvent.clear(screen.getByLabelText("Keep foil"));
    await userEvent.type(screen.getByLabelText("Keep foil"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Save keep policy" }));

    expect(onSave).toHaveBeenCalledWith({
      keepNormalQuantity: 8,
      keepFoilQuantity: 0,
      keepHolofoilQuantity: 1,
    });
  });

  it("clamps negative and fractional input to whole non-negative counts", async () => {
    const onSave = vi.fn();
    render(<KeepPolicyPanel policy={policy} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText("Keep normal"), { target: { value: "-3" } });
    await userEvent.clear(screen.getByLabelText("Keep foil"));
    await userEvent.type(screen.getByLabelText("Keep foil"), "2.7");
    await userEvent.clear(screen.getByLabelText("Keep holofoil"));
    await userEvent.click(screen.getByRole("button", { name: "Save keep policy" }));

    expect(onSave).toHaveBeenCalledWith({
      keepNormalQuantity: 0,
      keepFoilQuantity: 2,
      keepHolofoilQuantity: 0,
    });
  });

  it("reflects a refreshed policy without dropping local edits mid-render", () => {
    const { rerender } = render(<KeepPolicyPanel policy={policy} onSave={vi.fn()} />);
    expect(screen.getByLabelText("Keep normal")).toHaveValue(4);

    rerender(<KeepPolicyPanel policy={{ ...policy }} onSave={vi.fn()} />);
    expect(screen.getByLabelText("Keep normal")).toHaveValue(4);

    rerender(<KeepPolicyPanel policy={{ keepNormalQuantity: 6, keepFoilQuantity: 2, keepHolofoilQuantity: 0 }} onSave={vi.fn()} />);
    expect(screen.getByLabelText("Keep normal")).toHaveValue(6);
    expect(screen.getByLabelText("Keep holofoil")).toHaveValue(0);
  });

  it("disables the save button while a save is in flight", () => {
    render(<KeepPolicyPanel policy={policy} saving onSave={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  });
});
