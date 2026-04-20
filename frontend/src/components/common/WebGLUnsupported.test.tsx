import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WebGLUnsupported from "./WebGLUnsupported";

describe("WebGLUnsupported", () => {
  it("renders the error title and hint", () => {
    render(<WebGLUnsupported />);

    expect(screen.getByText("errors.webglUnsupported")).toBeInTheDocument();
    expect(screen.getByText("errors.webglUnsupportedHint")).toBeInTheDocument();
  });

  it("renders the warning icon", () => {
    const { container } = render(<WebGLUnsupported />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
