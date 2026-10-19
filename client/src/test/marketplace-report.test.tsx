import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import ReportModal from "../components/marketplace/ReportModal";

const { reportMock } = vi.hoisted(() => ({
  reportMock: vi.fn(),
}));

vi.mock("../services/api", () => ({
  marketplace: { report: reportMock },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

function renderModal() {
  return render(
    <MemoryRouter>
      <ReportModal targetType="LISTING" targetId="listing_1" label="Report listing" />
    </MemoryRouter>
  );
}

describe("ReportModal", () => {
  beforeEach(() => {
    reportMock.mockReset();
  });

  it("prompts anonymous visitors to sign in instead of showing the form", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any);
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Report listing" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/You need an account to submit a report/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("Reason")).not.toBeInTheDocument();
  });

  it("submits a report with the target and reason", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "u1", username: "bob" } } as any);
    reportMock.mockResolvedValue({ id: "report_1" });
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Report listing" }));
    const submit = await screen.findByRole("button", { name: "Submit report" });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Reason"), "This is a fake listing");
    expect(submit).toBeEnabled();

    await userEvent.click(submit);

    await waitFor(() =>
      expect(reportMock).toHaveBeenCalledWith({
        targetType: "LISTING",
        targetId: "listing_1",
        reason: "This is a fake listing",
      })
    );
    expect(await screen.findByText(/Report submitted/)).toBeInTheDocument();
  });

  it("surfaces a submission error and stays open", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "u1", username: "bob" } } as any);
    reportMock.mockRejectedValue(new Error("Report already exists"));
    renderModal();

    await userEvent.click(screen.getByRole("button", { name: "Report listing" }));
    await userEvent.type(await screen.findByLabelText("Reason"), "duplicate");
    await userEvent.click(screen.getByRole("button", { name: "Submit report" }));

    expect(await screen.findByText("Report already exists")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("defaults the trigger label for USER targets and does not close while submitting", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "u1", username: "bob" } } as any);
    let resolveReport: (value: unknown) => void = () => undefined;
    reportMock.mockImplementation(() => new Promise((resolve) => { resolveReport = resolve; }));
    render(
      <MemoryRouter>
        <ReportModal targetType="USER" targetId="user_1" />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Report user" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Report user" }));
    await userEvent.type(await screen.findByLabelText("Reason"), "spam");
    await userEvent.click(screen.getByRole("button", { name: "Submit report" }));

    // While submitting, the backdrop cannot close the modal.
    await userEvent.click(screen.getByText("Reason").closest("[role=dialog]")!.parentElement!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    resolveReport({ id: "report_1" });
    expect(await screen.findByText(/Report submitted/)).toBeInTheDocument();
  });
});
