import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CreateMissionDialog from "./CreateMissionDialog";
import MissionConfigForm from "./MissionConfigForm";
import InspectionList from "./InspectionList";
import TemplatePicker from "./TemplatePicker";

vi.mock("@/api/missions", () => ({
  createMission: vi
    .fn()
    .mockResolvedValue({ id: "m-new", name: "Test", status: "DRAFT" }),
}));

vi.mock("@/api/droneProfiles", () => ({
  listDroneProfiles: vi
    .fn()
    .mockResolvedValue({
      data: [{ id: "dp-1", name: "DJI Matrice 300" }],
    }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

import { createMission } from "@/api/missions";
import { listDroneProfiles } from "@/api/droneProfiles";

beforeEach(() => {
  vi.clearAllMocks();
});

/* ------------------------------------------------------------------ */
/*  CreateMissionDialog                                               */
/* ------------------------------------------------------------------ */

describe("CreateMissionDialog", () => {
  /** tests for the create mission dialog component. */

  function renderDialog(overrides: Partial<Parameters<typeof CreateMissionDialog>[0]> = {}) {
    /** render the dialog with sensible defaults. */
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      airportId: "apt-1",
      ...overrides,
    };
    return { ...render(<CreateMissionDialog {...props} />), props };
  }

  it("fetches drone profiles on open", async () => {
    /** verify drone profiles are loaded when dialog opens. */
    renderDialog();
    await waitFor(() => {
      expect(listDroneProfiles).toHaveBeenCalled();
    });
  });

  it("renders the form with expected fields", async () => {
    /** verify form fields are present. */
    renderDialog();
    await waitFor(() => {
      expect(screen.getByTestId("create-mission-form")).toBeInTheDocument();
    });
    expect(screen.getByTestId("drone-profile-select")).toBeInTheDocument();
  });

  it("shows nameRequired error when submitting empty name", async () => {
    /** validation: empty name triggers form error. */
    renderDialog();
    await waitFor(() => {
      expect(screen.getByTestId("create-mission-form")).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByTestId("create-mission-form"));

    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent(
        "dashboard.nameRequired",
      );
    });
  });

  it("shows droneRequired error when name filled but no drone selected", async () => {
    /** validation: missing drone profile triggers form error. */
    renderDialog();
    await waitFor(() => {
      expect(screen.getByTestId("create-mission-form")).toBeInTheDocument();
    });

    // the Input component spreads props - the data-testid lands on the <input>
    const nameInput = screen.getByTestId("mission-name-input");
    fireEvent.change(nameInput, { target: { value: "My Mission" } });
    fireEvent.submit(screen.getByTestId("create-mission-form"));

    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent(
        "dashboard.droneRequired",
      );
    });
  });

  it("calls createMission and navigates on successful submit", async () => {
    /** happy path: submit creates mission, closes dialog, navigates. */
    const { props } = renderDialog();
    await waitFor(() => {
      expect(screen.getByTestId("drone-profile-select")).toBeInTheDocument();
    });

    // wait for drone profiles to load
    await waitFor(() => {
      expect(screen.getByText("DJI Matrice 300")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("mission-name-input"), {
      target: { value: "Test Mission" },
    });
    fireEvent.change(screen.getByTestId("drone-profile-select"), {
      target: { value: "dp-1" },
    });
    fireEvent.submit(screen.getByTestId("create-mission-form"));

    await waitFor(() => {
      expect(createMission).toHaveBeenCalledWith({
        name: "Test Mission",
        airport_id: "apt-1",
        drone_profile_id: "dp-1",
      });
    });

    await waitFor(() => {
      expect(props.onClose).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith(
        "/operator-center/missions/m-new/overview",
      );
    });
  });

  it("shows submit error when createMission fails", async () => {
    /** error path: api failure shows submit-error. */
    vi.mocked(createMission).mockRejectedValueOnce(new Error("fail"));

    renderDialog();
    await waitFor(() => {
      expect(screen.getByText("DJI Matrice 300")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("mission-name-input"), {
      target: { value: "Bad Mission" },
    });
    fireEvent.change(screen.getByTestId("drone-profile-select"), {
      target: { value: "dp-1" },
    });
    fireEvent.submit(screen.getByTestId("create-mission-form"));

    await waitFor(() => {
      expect(screen.getByTestId("submit-error")).toHaveTextContent(
        "dashboard.createError",
      );
    });
  });

  it("shows drone-load-error when listDroneProfiles fails", async () => {
    /** error path: drone profile fetch failure shows error message. */
    vi.mocked(listDroneProfiles).mockRejectedValueOnce(new Error("network"));

    renderDialog();
    await waitFor(() => {
      expect(screen.getByTestId("drone-load-error")).toBeInTheDocument();
    });
  });

  it("renders nothing when not open", () => {
    /** closed dialog should not render any content. */
    renderDialog({ isOpen: false });
    expect(screen.queryByTestId("create-mission-form")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  MissionConfigForm                                                 */
/* ------------------------------------------------------------------ */

describe("MissionConfigForm", () => {
  /** tests for the mission configuration form component. */

  const mission = {
    id: "m-1",
    name: "Test",
    status: "DRAFT" as const,
    airport_id: "apt-1",
    drone_profile_id: "dp-1",
    default_speed: 5,
    default_altitude_offset: 10,
    takeoff_coordinate: null,
    landing_coordinate: null,
    operator_notes: null,
    inspections: [],
    created_at: "2026-03-01",
    date_time: null,
  };

  const droneProfiles = [{ id: "dp-1", name: "DJI Matrice 300" }];

  function renderForm(
    overrides: Partial<Parameters<typeof MissionConfigForm>[0]> = {},
  ) {
    /** render the config form with defaults. */
    const onChange = vi.fn();
    const props = {
      mission: mission as never,
      droneProfiles: droneProfiles as never,
      values: {},
      onChange,
      pickingCoord: null as never,
      onPickCoord: vi.fn(),
      ...overrides,
    };
    return { ...render(<MissionConfigForm {...props} />), onChange };
  }

  it("renders all main form fields", () => {
    /** verify presence of drone select, speed, altitude, and notes fields. */
    renderForm();
    expect(screen.getByTestId("drone-profile-select")).toBeInTheDocument();
    expect(screen.getByTestId("default-speed-input")).toBeInTheDocument();
    expect(
      screen.getByTestId("default-altitude-offset-input"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("operator-notes-textarea")).toBeInTheDocument();
  });

  it("displays mission values in fields", () => {
    /** verify fields are pre-populated from mission prop. */
    renderForm();
    // custom drone dropdown shows selected drone name
    expect(screen.getByTestId("drone-profile-select")).toHaveTextContent("DJI Matrice 300");
    expect(screen.getByTestId("default-speed-input")).toHaveValue(5);
    expect(screen.getByTestId("default-altitude-offset-input")).toHaveValue(10);
  });

  it("calls onChange when speed changes", () => {
    /** verify onChange fires with updated speed. */
    const { onChange } = renderForm();
    fireEvent.change(screen.getByTestId("default-speed-input"), {
      target: { value: "8.5" },
    });
    expect(onChange).toHaveBeenCalledWith({ default_speed: 8.5 });
  });

  it("calls onChange when altitude offset changes", () => {
    /** verify onChange fires with updated altitude offset. */
    const { onChange } = renderForm();
    fireEvent.change(screen.getByTestId("default-altitude-offset-input"), {
      target: { value: "15" },
    });
    expect(onChange).toHaveBeenCalledWith({ default_altitude_offset: 15 });
  });

  it("calls onChange when operator notes change", () => {
    /** verify onChange fires with updated notes. */
    const { onChange } = renderForm();
    fireEvent.change(screen.getByTestId("operator-notes-textarea"), {
      target: { value: "check runway 09" },
    });
    expect(onChange).toHaveBeenCalledWith({ operator_notes: "check runway 09" });
  });

  it("calls onChange when drone profile changes", () => {
    /** verify onChange fires with updated drone profile. */
    const { onChange } = renderForm();
    // open the custom dropdown
    fireEvent.click(screen.getByTestId("drone-profile-select"));
    // click the placeholder option to deselect
    fireEvent.click(screen.getByText("mission.config.selectDrone"));
    expect(onChange).toHaveBeenCalledWith({ drone_profile_id: null });
  });

  it("collapses form content on toggle click", () => {
    /** verify collapse button hides form fields. */
    renderForm();
    expect(screen.getByTestId("default-speed-input")).toBeInTheDocument();

    // click the collapse toggle button
    const toggle = screen.getByText("mission.config.missionConfig");
    fireEvent.click(toggle);

    expect(
      screen.queryByTestId("default-speed-input"),
    ).not.toBeInTheDocument();
  });

  it("uses values prop over mission prop when provided", () => {
    /** verify override values take precedence. */
    renderForm({ values: { default_speed: 99 } });
    expect(screen.getByTestId("default-speed-input")).toHaveValue(99);
  });

  it("calls onChange when transit AGL changes", () => {
    /** verify onChange fires with the new transit_agl value. */
    const { onChange } = renderForm();
    fireEvent.change(screen.getByTestId("transit-agl-input"), {
      target: { value: "120" },
    });
    expect(onChange).toHaveBeenCalledWith({ transit_agl: 120 });
  });

  it("clears transit AGL when emptied", () => {
    /** verify emptying the field sends null. */
    const { onChange } = renderForm({ values: { transit_agl: 80 } });
    fireEvent.change(screen.getByTestId("transit-agl-input"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith({ transit_agl: null });
  });
});

/* ------------------------------------------------------------------ */
/*  InspectionList                                                    */
/* ------------------------------------------------------------------ */

describe("InspectionList", () => {
  /** tests for the inspection list component. */

  const inspections = [
    {
      id: "i-1",
      mission_id: "m-1",
      template_id: "t-1",
      config_id: null,
      method: "ANGULAR_SWEEP",
      sequence_order: 1,
      lha_ids: null,
      config: null,
    },
    {
      id: "i-2",
      mission_id: "m-1",
      template_id: "t-2",
      config_id: null,
      method: "VERTICAL_PROFILE",
      sequence_order: 2,
      lha_ids: null,
      config: null,
    },
  ];

  const templates = new Map([
    ["t-1", { id: "t-1", name: "PAPI Check" }],
    ["t-2", { id: "t-2", name: "Approach Lights" }],
  ]);

  function renderList(
    overrides: Partial<Parameters<typeof InspectionList>[0]> = {},
  ) {
    /** render the inspection list with defaults. */
    const props = {
      inspections: inspections as never,
      templates: templates as never,
      selectedId: null,
      onSelect: vi.fn(),
      onReorder: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
      isDraft: true,
      canReorder: true,
      visibleIds: new Set(["i-1", "i-2"]),
      onToggleVisibility: vi.fn(),
      ...overrides,
    };
    return { ...render(<InspectionList {...props} />), props };
  }

  it("shows count badge", () => {
    /** verify X/10 count badge is displayed. */
    renderList();
    expect(screen.getByText("2/10")).toBeInTheDocument();
  });

  it("renders inspection rows with template names", () => {
    /** verify each inspection row shows template name. */
    renderList();
    expect(screen.getByText("PAPI Check")).toBeInTheDocument();
    expect(screen.getByText("Approach Lights")).toBeInTheDocument();
  });

  it("calls onSelect when clicking an inspection row", () => {
    /** verify row click triggers onSelect. */
    const { props } = renderList();
    fireEvent.click(screen.getByTestId("inspection-row-i-1"));
    expect(props.onSelect).toHaveBeenCalledWith("i-1");
  });

  it("deselects when clicking an already selected inspection", () => {
    /** verify clicking selected row deselects it. */
    const { props } = renderList({ selectedId: "i-1" });
    fireEvent.click(screen.getByTestId("inspection-row-i-1"));
    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it("shows remove button when isDraft", () => {
    /** verify remove buttons are visible in draft mode. */
    renderList({ isDraft: true });
    expect(
      screen.getByTestId("remove-inspection-i-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("remove-inspection-i-2"),
    ).toBeInTheDocument();
  });

  it("hides remove button when not draft", () => {
    /** verify remove buttons are hidden for non-draft missions. */
    renderList({ isDraft: false });
    expect(
      screen.queryByTestId("remove-inspection-i-1"),
    ).not.toBeInTheDocument();
  });

  it("calls onRemove when remove button is clicked", () => {
    /** verify remove button triggers onRemove. */
    const { props } = renderList();
    fireEvent.click(screen.getByTestId("remove-inspection-i-1"));
    expect(props.onRemove).toHaveBeenCalledWith("i-1");
  });

  it("calls onToggleVisibility when visibility button is clicked", () => {
    /** verify visibility toggle triggers callback. */
    const { props } = renderList();
    fireEvent.click(screen.getByTestId("toggle-visibility-i-1"));
    expect(props.onToggleVisibility).toHaveBeenCalledWith("i-1");
  });

  it("disables add button when not draft", () => {
    /** verify add button is disabled for non-draft missions. */
    renderList({ isDraft: false });
    expect(screen.getByTestId("add-inspection-btn")).toBeDisabled();
  });

  it("disables add button when 10 inspections exist", () => {
    /** verify add button is disabled at max capacity. */
    const tenInspections = Array.from({ length: 10 }, (_, i) => ({
      id: `i-${i}`,
      mission_id: "m-1",
      template_id: "t-1",
      config_id: null,
      method: "ANGULAR_SWEEP",
      sequence_order: i + 1,
      lha_ids: null,
      config: null,
    }));
    renderList({ inspections: tenInspections as never });
    expect(screen.getByTestId("add-inspection-btn")).toBeDisabled();
  });

  it("enables add button when draft and under limit", () => {
    /** verify add button is enabled in valid state. */
    renderList({ isDraft: true });
    expect(screen.getByTestId("add-inspection-btn")).not.toBeDisabled();
  });

  it("shows empty state when no inspections", () => {
    /** verify empty message appears with empty list. */
    renderList({ inspections: [] });
    expect(
      screen.getByText("mission.config.noInspectionSelected"),
    ).toBeInTheDocument();
  });

  it("collapses inspection list on toggle click", () => {
    /** verify collapse hides inspection rows. */
    renderList();
    expect(screen.getByTestId("inspection-row-i-1")).toBeInTheDocument();

    fireEvent.click(screen.getByText("mission.config.inspections"));

    expect(
      screen.queryByTestId("inspection-row-i-1"),
    ).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  TemplatePicker                                                    */
/* ------------------------------------------------------------------ */

describe("TemplatePicker", () => {
  /** tests for the template picker modal component. */

  const templates = [
    {
      id: "t-1",
      name: "PAPI",
      description: "PAPI check",
      methods: ["ANGULAR_SWEEP"],
      target_agl_ids: [],
      default_config: null,
      angular_tolerances: null,
      created_by: null,
      created_at: null,
    },
    {
      id: "t-2",
      name: "Approach",
      description: null,
      methods: ["ANGULAR_SWEEP", "VERTICAL_PROFILE"],
      target_agl_ids: [],
      default_config: null,
      angular_tolerances: null,
      created_by: null,
      created_at: null,
    },
  ];

  function renderPicker(
    overrides: Partial<Parameters<typeof TemplatePicker>[0]> = {},
  ) {
    /** render the template picker with defaults. */
    const props = {
      isOpen: true,
      onClose: vi.fn(),
      templates: templates as never,
      onSelect: vi.fn(),
      usedTemplateIds: new Set<string>(),
      ...overrides,
    };
    return { ...render(<TemplatePicker {...props} />), props };
  }

  it("renders template options", () => {
    /** verify all templates are displayed. */
    renderPicker();
    expect(screen.getByText("PAPI")).toBeInTheDocument();
    expect(screen.getByText("Approach")).toBeInTheDocument();
  });

  it("shows template description when present", () => {
    /** verify description text is rendered. */
    renderPicker();
    expect(screen.getByText("PAPI check")).toBeInTheDocument();
  });

  it("calls onSelect and onClose when a template is clicked", () => {
    /** verify selecting a template triggers callbacks. */
    const { props } = renderPicker();
    fireEvent.click(screen.getByTestId("template-option-t-1"));
    expect(props.onSelect).toHaveBeenCalledWith("t-1", "ANGULAR_SWEEP");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("shows 'in mission' badge for used templates", () => {
    /** verify badge appears for templates already in the mission. */
    renderPicker({ usedTemplateIds: new Set(["t-1"]) });
    expect(
      screen.getByText("mission.config.inMission"),
    ).toBeInTheDocument();
  });

  it("shows method selector for templates with multiple methods", () => {
    /** verify method dropdown appears for multi-method templates. */
    renderPicker();
    expect(screen.getByTestId("method-select-t-2")).toBeInTheDocument();
    // single-method template should not have a select
    expect(
      screen.queryByTestId("method-select-t-1"),
    ).not.toBeInTheDocument();
  });

  it("uses selected method when clicking a multi-method template", () => {
    /** verify method selector value is passed to onSelect. */
    const { props } = renderPicker();

    // change method selection first
    fireEvent.change(screen.getByTestId("method-select-t-2"), {
      target: { value: "VERTICAL_PROFILE" },
    });
    fireEvent.click(screen.getByTestId("template-option-t-2"));

    expect(props.onSelect).toHaveBeenCalledWith("t-2", "VERTICAL_PROFILE");
  });

  it("shows empty state when no templates", () => {
    /** verify empty message when template list is empty. */
    renderPicker({ templates: [] });
    expect(screen.getByText("common.noResults")).toBeInTheDocument();
  });

  it("renders nothing when not open", () => {
    /** closed picker should not render content. */
    renderPicker({ isOpen: false });
    expect(
      screen.queryByTestId("template-picker-list"),
    ).not.toBeInTheDocument();
  });

  describe("2-step AGL grouping", () => {
    /** tests for the AGL-type-first workflow when agls prop is provided. */

    const papiAgl = {
      id: "agl-papi",
      surface_id: "s-1",
      agl_type: "PAPI",
      name: "PAPI RWY 09",
      position: { lat: 0, lng: 0, alt: 0 },
      side: null,
      glide_slope_angle: null,
      distance_from_threshold: null,
      offset_from_centerline: null,
      lhas: [],
    };
    const runwayAgl = {
      id: "agl-runway",
      surface_id: "s-1",
      agl_type: "RUNWAY_EDGE_LIGHTS",
      name: "RWY EDGE 09",
      position: { lat: 0, lng: 0, alt: 0 },
      side: null,
      glide_slope_angle: null,
      distance_from_threshold: null,
      offset_from_centerline: null,
      lhas: [],
    };

    const groupedTemplates = [
      {
        id: "t-papi",
        name: "PAPI Angular",
        description: null,
        methods: ["VERTICAL_PROFILE", "ANGULAR_SWEEP", "HOVER_POINT_LOCK"],
        target_agl_ids: ["agl-papi"],
        default_config: null,
        angular_tolerances: null,
        created_by: null,
        created_at: null,
      },
      {
        id: "t-runway",
        name: "Runway Fly-over",
        description: null,
        methods: ["FLY_OVER", "PARALLEL_SIDE_SWEEP", "HOVER_POINT_LOCK"],
        target_agl_ids: ["agl-runway"],
        default_config: null,
        angular_tolerances: null,
        created_by: null,
        created_at: null,
      },
    ];

    it("shows AGL type step when agls provided", () => {
      renderPicker({
        templates: groupedTemplates as never,
        agls: [papiAgl, runwayAgl] as never,
      });
      expect(screen.getByTestId("agl-type-step")).toBeInTheDocument();
      expect(
        screen.getByTestId("agl-type-option-PAPI"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("agl-type-option-RUNWAY_EDGE_LIGHTS"),
      ).toBeInTheDocument();
    });

    it("drills into template list after selecting AGL type", () => {
      renderPicker({
        templates: groupedTemplates as never,
        agls: [papiAgl, runwayAgl] as never,
      });
      fireEvent.click(screen.getByTestId("agl-type-option-PAPI"));
      expect(screen.getByTestId("template-step")).toBeInTheDocument();
      expect(screen.getByTestId("template-option-t-papi")).toBeInTheDocument();
      // runway template should not appear under PAPI
      expect(
        screen.queryByTestId("template-option-t-runway"),
      ).not.toBeInTheDocument();
    });

    it("back button returns to AGL type step", () => {
      renderPicker({
        templates: groupedTemplates as never,
        agls: [papiAgl, runwayAgl] as never,
      });
      fireEvent.click(screen.getByTestId("agl-type-option-PAPI"));
      fireEvent.click(screen.getByTestId("back-to-agl-step"));
      expect(screen.getByTestId("agl-type-step")).toBeInTheDocument();
    });

    it("filters methods in dropdown to those compatible with AGL", () => {
      renderPicker({
        templates: groupedTemplates as never,
        agls: [papiAgl, runwayAgl] as never,
      });
      fireEvent.click(screen.getByTestId("agl-type-option-PAPI"));
      const select = screen.getByTestId(
        "method-select-t-papi",
      ) as HTMLSelectElement;
      const values = Array.from(select.options).map((o) => o.value);
      // FLY_OVER and PARALLEL_SIDE_SWEEP must NOT appear for PAPI
      expect(values).not.toContain("FLY_OVER");
      expect(values).not.toContain("PARALLEL_SIDE_SWEEP");
      expect(values).toContain("VERTICAL_PROFILE");
    });

    it("falls back to flat list when no agls provided", () => {
      renderPicker({ templates: groupedTemplates as never });
      // flat mode: both templates rendered, no AGL step
      expect(
        screen.queryByTestId("agl-type-step"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId("template-option-t-papi"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("template-option-t-runway"),
      ).toBeInTheDocument();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  InspectionList method dropdown                                    */
/* ------------------------------------------------------------------ */

describe("InspectionList method dropdown", () => {
  /** tests for the per-row method dropdown. */

  const runwayAgl = {
    id: "agl-runway",
    surface_id: "s-1",
    agl_type: "RUNWAY_EDGE_LIGHTS",
    name: "RWY EDGE 09",
    position: { lat: 0, lng: 0, alt: 0 },
    side: null,
    glide_slope_angle: null,
    distance_from_threshold: null,
    offset_from_centerline: null,
    lhas: [],
  };

  const inspections = [
    {
      id: "i-1",
      mission_id: "m-1",
      template_id: "t-1",
      config_id: null,
      method: "FLY_OVER",
      sequence_order: 1,
      lha_ids: null,
      config: null,
    },
  ];

  const templates = new Map([
    [
      "t-1",
      {
        id: "t-1",
        name: "Runway Inspection",
        description: null,
        methods: ["FLY_OVER", "PARALLEL_SIDE_SWEEP", "HOVER_POINT_LOCK"],
        target_agl_ids: ["agl-runway"],
        default_config: null,
        angular_tolerances: null,
        created_by: null,
        created_at: null,
      },
    ],
  ]);

  it("does not render dropdown when onChangeMethod is omitted", () => {
    render(
      <InspectionList
        inspections={inspections as never}
        templates={templates as never}
        selectedId={null}
        onSelect={vi.fn()}
        onReorder={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        isDraft={true}
        canReorder={true}
        visibleIds={new Set(["i-1"])}
        onToggleVisibility={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("inspection-method-select-i-1"),
    ).not.toBeInTheDocument();
  });

  it("renders dropdown filtered to AGL-compatible methods", () => {
    const onChangeMethod = vi.fn();
    render(
      <InspectionList
        inspections={inspections as never}
        templates={templates as never}
        selectedId={null}
        onSelect={vi.fn()}
        onReorder={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        isDraft={true}
        canReorder={true}
        visibleIds={new Set(["i-1"])}
        onToggleVisibility={vi.fn()}
        agls={[runwayAgl] as never}
        onChangeMethod={onChangeMethod}
      />,
    );
    const select = screen.getByTestId(
      "inspection-method-select-i-1",
    ) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("FLY_OVER");
    expect(values).toContain("PARALLEL_SIDE_SWEEP");
    expect(values).toContain("HOVER_POINT_LOCK");
    // PAPI-only methods must NOT appear
    expect(values).not.toContain("VERTICAL_PROFILE");
    expect(values).not.toContain("ANGULAR_SWEEP");
  });

  it("calls onChangeMethod when selection changes", () => {
    const onChangeMethod = vi.fn();
    render(
      <InspectionList
        inspections={inspections as never}
        templates={templates as never}
        selectedId={null}
        onSelect={vi.fn()}
        onReorder={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        isDraft={true}
        canReorder={true}
        visibleIds={new Set(["i-1"])}
        onToggleVisibility={vi.fn()}
        agls={[runwayAgl] as never}
        onChangeMethod={onChangeMethod}
      />,
    );
    fireEvent.change(screen.getByTestId("inspection-method-select-i-1"), {
      target: { value: "PARALLEL_SIDE_SWEEP" },
    });
    expect(onChangeMethod).toHaveBeenCalledWith("i-1", "PARALLEL_SIDE_SWEEP");
  });
});
