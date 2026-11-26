// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { CoopGrid } from "../src/components/CoopGrid";

afterEach(cleanup);

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

describe("CoopGrid", () => {
  it("lights sponsored birds, marks hatching ones and opens a lit bird", () => {
    const { container } = render(
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<><CoopGrid total={10} sponsored={new Set([2, 5])} pending={3} columns={5} /><Where /></>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.querySelectorAll(".cell-lit")).toHaveLength(2);
    expect(container.querySelectorAll(".cell-hatch")).toHaveLength(3);
    expect(container.querySelectorAll(".cell-dark")).toHaveLength(5);
    expect(screen.getByText("2 sponsored")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Open chicken KK-0005"));
    expect(screen.getByTestId("where").textContent).toBe("/chicken/5");
  });
});
