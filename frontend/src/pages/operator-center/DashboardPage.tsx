import CollapsibleSection from "@/components/common/CollapsibleSection";

export default function DashboardPage() {
  return (
    <div className="flex gap-4 p-4 h-full">
      {/* left panel - 30% */}
      <div className="w-[30%] flex-shrink-0 overflow-auto flex flex-col gap-4">
        <CollapsibleSection title="Mission Overview">
          <p className="text-sm text-tv-text-muted">Coming soon</p>
        </CollapsibleSection>
        <CollapsibleSection title="Active Missions">
          <p className="text-sm text-tv-text-muted">Coming soon</p>
        </CollapsibleSection>
        <CollapsibleSection title="Drone Status">
          <p className="text-sm text-tv-text-muted">Coming soon</p>
        </CollapsibleSection>
        <CollapsibleSection title="Recent Activity">
          <p className="text-sm text-tv-text-muted">Coming soon</p>
        </CollapsibleSection>
      </div>

      {/* right panel - 70% */}
      <div
        className="flex-1 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: "var(--tv-map-bg)" }}
      >
        <p className="text-sm text-tv-text-muted">Map placeholder</p>
      </div>
    </div>
  );
}
