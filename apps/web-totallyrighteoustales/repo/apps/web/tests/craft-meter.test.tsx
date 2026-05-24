import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import CraftMeter from "../components/CraftMeter";

test("shows craft progress without requiring AI", () => {
  render(
    <CraftMeter
      title="The Porch That Remembered"
      body={"A handmade scene with a strange promise. ".repeat(40)}
      spine={{
        premise: "A porch remembers old promises",
        character: "A shy caretaker",
        stakes: "The town loses its oldest promise",
        turn: "The porch asks to be carried home",
      }}
      studioUsed={false}
      pledgeAccepted={true}
    />,
  );

  expect(screen.getByText("Craft readiness")).toBeInTheDocument();
  expect(screen.getByText("Hand-led")).toBeInTheDocument();
  expect(screen.getByText(/4 of 4 spine notes/)).toBeInTheDocument();
});
