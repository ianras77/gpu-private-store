import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import TaleCard from "../components/TaleCard";
import type { TaleSummary } from "@trt/shared";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

const tale: TaleSummary = {
  id: "1",
  title: "Test Tale",
  excerpt: "A very righteous test tale",
  authorPseudonym: "Juniper Vale",
  authorAvatarUrl: null,
  createdAt: new Date().toISOString(),
  status: "APPROVED",
  assistMode: "HANDMADE",
  storyPrompt: null,
  isAnonymous: false,
  hotScore: 1,
  topScore: 1,
  imageUrl: null,
  upvotes: 2,
  downvotes: 0
};

test("renders a tale card", () => {
  render(<TaleCard tale={tale} />);
  expect(screen.getByText("Test Tale")).toBeInTheDocument();
  expect(screen.getByText(/Juniper Vale/)).toBeInTheDocument();
});
