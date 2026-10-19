import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import SearchableMultiSelect from "../components/SearchableMultiSelect";

const options = ["Amber", "Ruby", "Sapphire", "Steel"];

function renderSelect(props: Partial<Parameters<typeof SearchableMultiSelect>[0]> = {}) {
  const onToggle = vi.fn();
  render(
    <SearchableMultiSelect label="Colors" options={options} selected={[]} onToggle={onToggle} {...props} />
  );
  return onToggle;
}

describe("SearchableMultiSelect", () => {
  it("shows 'All X' when nothing is selected", () => {
    renderSelect();
    expect(screen.getByRole("button", { name: "All Colors" })).toBeInTheDocument();
  });

  it("shows the single selected value", () => {
    renderSelect({ selected: ["Ruby"] });
    expect(screen.getByRole("button", { name: "Ruby" })).toBeInTheDocument();
  });

  it("shows 'N selected' for multiple selections", () => {
    renderSelect({ selected: ["Ruby", "Amber"] });
    expect(screen.getByRole("button", { name: "2 selected" })).toBeInTheDocument();
  });

  it("opens a dropdown with a search input and checkbox list", async () => {
    renderSelect();
    await userEvent.click(screen.getByRole("button", { name: "All Colors" }));
    expect(screen.getByRole("textbox", { name: "Search Colors" })).toBeInTheDocument();
    expect(screen.getByLabelText("Amber")).toBeInTheDocument();
    expect(screen.getByLabelText("Steel")).toBeInTheDocument();
  });

  it("toggles a value via its checkbox", async () => {
    const onToggle = renderSelect();
    await userEvent.click(screen.getByRole("button", { name: "All Colors" }));
    await userEvent.click(screen.getByLabelText("Ruby"));
    expect(onToggle).toHaveBeenCalledWith("Ruby");
  });

  it("filters case-insensitively and clearing restores the full list preserving checks", async () => {
    renderSelect({ selected: ["Ruby"] });
    await userEvent.click(screen.getByRole("button", { name: "Ruby" }));

    const search = screen.getByRole("textbox", { name: "Search Colors" });
    await userEvent.type(search, "SAPP");
    expect(screen.getByLabelText("Sapphire")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ruby")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Amber")).not.toBeInTheDocument();

    await userEvent.clear(search);
    expect(screen.getByLabelText("Ruby")).toBeInTheDocument();
    expect(screen.getByLabelText("Amber")).toBeInTheDocument();
    expect(screen.getByLabelText("Ruby")).toBeChecked();
  });

  it("closes on click outside", async () => {
    renderSelect();
    await userEvent.click(screen.getByRole("button", { name: "All Colors" }));
    expect(screen.getByRole("textbox", { name: "Search Colors" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("textbox", { name: "Search Colors" })).not.toBeInTheDocument();
  });

  it("applies renderLabel to button and option labels", () => {
    render(
      <SearchableMultiSelect
        label="Costs"
        options={["1", "2"]}
        selected={["2"]}
        onToggle={vi.fn()}
        renderLabel={(value) => `Cost ${value}`}
      />
    );
    expect(screen.getByRole("button", { name: "Cost 2" })).toBeInTheDocument();
  });
});
