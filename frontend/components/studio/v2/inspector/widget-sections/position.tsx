/**
 * Layout section — position presets + X/Y/W/H/rotation. Applied to every
 * widget kind as the first inspector section.
 */
import i18n from "@/lib/i18n/i18n";
import { DegreesField, PositionField } from "../fields";
import PositionPresets from "../PositionPresets";
import type { WidgetInspectorSection } from "../types";

export const LAYOUT_SECTION: WidgetInspectorSection = {
  id: "layout",
  titleKey: "studio.style.layout",
  defaultOpen: true,
  render: ({ widget, onUpdateWidgetPosition }) => (
    <div className="space-y-3">
      {/* Quick layout — same 9-slot presets v1 had on every element. */}
      <PositionPresets
        position={widget.position}
        onApply={(box) =>
          onUpdateWidgetPosition({ ...widget.position, ...box })
        }
      />
      <div className="grid grid-cols-2 gap-2">
        <PositionField
          label="X"
          value={widget.position.x}
          onChange={(x) => onUpdateWidgetPosition({ ...widget.position, x })}
        />
        <PositionField
          label="Y"
          value={widget.position.y}
          onChange={(y) => onUpdateWidgetPosition({ ...widget.position, y })}
        />
        <PositionField
          label={i18n.t("studio.effects.param.width")}
          value={widget.position.width}
          onChange={(width) => onUpdateWidgetPosition({ ...widget.position, width })}
        />
        <PositionField
          label={i18n.t("studio.effects.param.height")}
          value={widget.position.height}
          onChange={(height) => onUpdateWidgetPosition({ ...widget.position, height })}
        />
        <DegreesField
          label={i18n.t("studio.effects.param.rotation")}
          value={widget.position.rotation}
          onChange={(rotation) => onUpdateWidgetPosition({ ...widget.position, rotation })}
        />
      </div>
    </div>
  ),
};
