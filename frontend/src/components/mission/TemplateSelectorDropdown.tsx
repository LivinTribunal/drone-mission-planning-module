import { useTranslation } from "react-i18next";
import Dropdown from "@/components/common/Dropdown";
import type { InspectionTemplateResponse } from "@/types/inspectionTemplate";

interface TemplateSelectorDropdownProps {
  templates: InspectionTemplateResponse[];
  currentId: string;
  onSelect: (id: string) => void;
}

export default function TemplateSelectorDropdown({
  templates,
  currentId,
  onSelect,
}: TemplateSelectorDropdownProps) {
  const { t } = useTranslation();

  const items = templates.map((tpl) => ({
    key: tpl.id,
    label: (
      <span className={tpl.id === currentId ? "font-semibold text-tv-accent" : ""}>
        {tpl.name}
      </span>
    ),
    disabled: tpl.id === currentId,
    onClick: () => onSelect(tpl.id),
  }));

  return (
    <Dropdown
      trigger={t("coordinator.inspections.switchTemplate")}
      items={items}
    />
  );
}
