import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Button from "./Button";
import Input from "./Input";
import Modal from "./Modal";
import Badge from "./Badge";
import Card from "./Card";
import Dropdown from "./Dropdown";
import CollapsibleSection from "./CollapsibleSection";
import RowActionMenu from "./RowActionMenu";

/** tests for shared common UI components. */

describe("Button", () => {
  /** covers variants, disabled state, and prop forwarding. */

  it("renders children and defaults to primary variant", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain("bg-tv-accent");
  });

  it("applies secondary variant styles", () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole("button", { name: "Cancel" });
    expect(btn.className).toContain("bg-transparent");
    expect(btn.className).toContain("border");
  });

  it("applies danger variant styles", () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toContain("bg-tv-error");
  });

  it("applies icon variant styles", () => {
    render(<Button variant="icon">+</Button>);
    const btn = screen.getByRole("button", { name: "+" });
    expect(btn.className).toContain("aspect-square");
  });

  it("adds disabled classes when disabled", () => {
    render(<Button disabled>Save</Button>);
    const btn = screen.getByRole("button", { name: "Save" });
    expect(btn).toBeDisabled();
    expect(btn.className).toContain("opacity-50");
    expect(btn.className).toContain("cursor-not-allowed");
  });

  it("forwards extra props like onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("merges custom className", () => {
    render(<Button className="ml-4">Ok</Button>);
    expect(screen.getByRole("button", { name: "Ok" }).className).toContain(
      "ml-4",
    );
  });
});

describe("Input", () => {
  /** covers label rendering and prop forwarding. */

  it("renders label when provided", () => {
    render(<Input label="Email" id="email" />);
    const label = screen.getByText("Email");
    expect(label.tagName).toBe("LABEL");
    expect(label).toHaveAttribute("for", "email");
  });

  it("does not render label when omitted", () => {
    render(<Input id="name" placeholder="Name" />);
    expect(screen.queryByText(/./)).toBeDefined();
    expect(screen.getByPlaceholderText("Name")).toBeInTheDocument();
  });

  it("forwards html input attributes", () => {
    render(<Input id="age" type="number" min={0} max={100} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("min", "0");
  });

  it("merges custom className", () => {
    render(<Input id="x" className="w-1/2" />);
    const input = document.querySelector("input#x");
    expect(input?.className).toContain("w-1/2");
  });
});

describe("Modal", () => {
  /** covers open/close, escape key, backdrop click, and accessibility. */

  it("renders nothing when isOpen is false", () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Test">
        content
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog with title and children when open", () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Confirm">
        <p>Are you sure?</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("has correct aria attributes", () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="A">
        body
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="X">
        body
      </Modal>,
    );
    fireEvent.click(screen.getByTestId("modal-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="X">
        body
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on backdrop click", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="X">
        body
      </Modal>,
    );
    fireEvent.click(screen.getByTestId("modal-overlay"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when clicking inside content", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={onClose} title="X">
        <button>inside</button>
      </Modal>,
    );
    fireEvent.click(screen.getByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Badge", () => {
  /** covers translation key usage and status-specific styles. */

  it("renders translated status text", () => {
    render(<Badge status="DRAFT" />);
    expect(screen.getByText("missionStatus.DRAFT")).toBeInTheDocument();
  });

  it("renders all status variants without errors", () => {
    const statuses = [
      "DRAFT",
      "PLANNED",
      "VALIDATED",
      "EXPORTED",
      "COMPLETED",
      "CANCELLED",
    ] as const;
    for (const status of statuses) {
      const { unmount } = render(<Badge status={status} />);
      expect(
        screen.getByText(`missionStatus.${status}`),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("merges custom className", () => {
    render(<Badge status="PLANNED" className="ml-2" />);
    expect(screen.getByText("missionStatus.PLANNED").className).toContain(
      "ml-2",
    );
  });
});

describe("Card", () => {
  /** covers children rendering and className merging. */

  it("renders children", () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("applies card styles", () => {
    const { container } = render(<Card>X</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain("bg-tv-surface");
    expect(div.className).toContain("rounded-2xl");
  });

  it("merges custom className", () => {
    const { container } = render(<Card className="mt-4">X</Card>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain("mt-4");
  });
});

describe("Dropdown", () => {
  /** covers toggle, item clicks, disabled items, and outside clicks. */

  const items = [
    { key: "a", label: "Alpha", onClick: vi.fn() },
    { key: "b", label: "Beta", disabled: true, onClick: vi.fn() },
  ];

  function resetMocks() {
    items.forEach((i) => i.onClick?.mockReset());
  }

  it("does not show items initially", () => {
    render(<Dropdown trigger="Menu" items={items} />);
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("toggles dropdown on trigger click", () => {
    resetMocks();
    render(<Dropdown trigger="Menu" items={items} />);
    fireEvent.click(screen.getByText("Menu"));
    expect(screen.getByText("Alpha")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Menu"));
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("calls onClick and closes on item click", () => {
    resetMocks();
    render(<Dropdown trigger="Menu" items={items} />);
    fireEvent.click(screen.getByText("Menu"));
    fireEvent.click(screen.getByText("Alpha"));
    expect(items[0].onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("does not fire onClick for disabled items", () => {
    resetMocks();
    render(<Dropdown trigger="Menu" items={items} />);
    fireEvent.click(screen.getByText("Menu"));
    const beta = screen.getByText("Beta");
    fireEvent.click(beta);
    expect(items[1].onClick).not.toHaveBeenCalled();
  });

  it("closes on outside click", () => {
    resetMocks();
    render(<Dropdown trigger="Menu" items={items} />);
    fireEvent.click(screen.getByText("Menu"));
    expect(screen.getByText("Alpha")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });
});

describe("CollapsibleSection", () => {
  /** covers expand/collapse, default state, and count badge. */

  it("renders expanded by default", () => {
    render(
      <CollapsibleSection title="Details">
        <p>Inner</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText("Inner")).toBeInTheDocument();
  });

  it("collapses on click and hides children", () => {
    render(
      <CollapsibleSection title="Details">
        <p>Inner</p>
      </CollapsibleSection>,
    );
    fireEvent.click(screen.getByTestId("section-details"));
    expect(screen.queryByText("Inner")).not.toBeInTheDocument();
  });

  it("starts collapsed when defaultExpanded is false", () => {
    render(
      <CollapsibleSection title="Info" defaultExpanded={false}>
        <p>Hidden</p>
      </CollapsibleSection>,
    );
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });

  it("expands on click when initially collapsed", () => {
    render(
      <CollapsibleSection title="Info" defaultExpanded={false}>
        <p>Revealed</p>
      </CollapsibleSection>,
    );
    fireEvent.click(screen.getByTestId("section-info"));
    expect(screen.getByText("Revealed")).toBeInTheDocument();
  });

  it("shows count badge when count provided", () => {
    render(
      <CollapsibleSection title="Items" count={5}>
        <p>List</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("does not show count badge when count omitted", () => {
    render(
      <CollapsibleSection title="Items">
        <p>List</p>
      </CollapsibleSection>,
    );
    const section = screen.getByTestId("section-items");
    expect(section.parentElement?.querySelectorAll("span").length).toBe(1);
  });

  it("generates correct data-testid from multi-word title", () => {
    render(
      <CollapsibleSection title="Safety Zones">
        <p>Content</p>
      </CollapsibleSection>,
    );
    expect(screen.getByTestId("section-safety-zones")).toBeInTheDocument();
  });
});

describe("RowActionMenu", () => {
  /** covers trigger, action clicks, stop propagation, and danger variant. */

  const actions = [
    { label: "Edit", onClick: vi.fn() },
    { label: "Remove", onClick: vi.fn(), variant: "danger" as const },
  ];

  function resetMocks() {
    actions.forEach((a) => a.onClick.mockReset());
  }

  it("does not show menu initially", () => {
    render(<RowActionMenu actions={actions} />);
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("opens menu on trigger click", () => {
    resetMocks();
    render(<RowActionMenu actions={actions} />);
    fireEvent.click(screen.getByTestId("row-action-trigger"));
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
  });

  it("calls action onClick and closes menu", () => {
    resetMocks();
    render(<RowActionMenu actions={actions} />);
    fireEvent.click(screen.getByTestId("row-action-trigger"));
    fireEvent.click(screen.getByText("Edit"));
    expect(actions[0].onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("trigger click uses stopPropagation", () => {
    resetMocks();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <RowActionMenu actions={actions} />
      </div>,
    );
    fireEvent.click(screen.getByTestId("row-action-trigger"));
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("applies text-tv-error class to danger variant", () => {
    resetMocks();
    render(<RowActionMenu actions={actions} />);
    fireEvent.click(screen.getByTestId("row-action-trigger"));
    const removeBtn = screen.getByText("Remove");
    expect(removeBtn.className).toContain("text-tv-error");
  });

  it("closes on outside click", () => {
    resetMocks();
    render(<RowActionMenu actions={actions} />);
    fireEvent.click(screen.getByTestId("row-action-trigger"));
    expect(screen.getByText("Edit")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });
});
