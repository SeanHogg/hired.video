import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CampaignSizeGroupedList,
  CampaignSizeViewToggle,
  type SizeAwareCampaign,
} from "../CampaignSizeGroupedList";

const CAMPAIGNS: SizeAwareCampaign[] = [
  { id: "sq", name: "Square ads", status: "active", assets: [{ width: 1080, height: 1080 }] },
  { id: "land", name: "Landscape ads", assets: [{ width: 1920, height: 1080 }] },
  { id: "none", name: "No creatives", assets: [] },
];

describe("<CampaignSizeViewToggle />", () => {
  it("marks the active mode and reports the other on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CampaignSizeViewToggle value="list" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "By size" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "By size" }));
    expect(onChange).toHaveBeenCalledWith("grouped");
  });
});

describe("<CampaignSizeGroupedList />", () => {
  it("renders size-group headings and campaign names", () => {
    render(<CampaignSizeGroupedList campaigns={CAMPAIGNS} />);
    expect(screen.getByRole("heading", { name: /Landscape/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Square/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Unspecified/ })).toBeInTheDocument();
    expect(screen.getByText("Square ads")).toBeInTheDocument();
    expect(screen.getByText("Landscape ads")).toBeInTheDocument();
    expect(screen.getByText("No creatives")).toBeInTheDocument();
  });

  it("calls onSelect with the campaign id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CampaignSizeGroupedList campaigns={CAMPAIGNS} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /Square ads/ }));
    expect(onSelect).toHaveBeenCalledWith("sq");
  });

  it("renders an empty state when there are no campaigns", () => {
    render(<CampaignSizeGroupedList campaigns={[]} />);
    expect(screen.getByText("No campaigns yet.")).toBeInTheDocument();
  });
});
