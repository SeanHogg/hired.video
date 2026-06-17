/**
 * MetaPanel — the entity METADATA form shown in the Studio create/edit flow
 * (#1955 T0.2). This is "the form" the user fills as part of creating an entity
 * (a Course's title / cover / summary / theme / category / tags / price; a
 * company's name / industry / locations; …). It is schema-driven over the
 * shared [FieldGroupEditor](../fields/FieldGroupEditor.tsx), so every entity
 * declares a `SectionFieldDef[]` meta schema and gets a consistent form for
 * free — no per-entity form component.
 *
 * The panel is body-agnostic: it edits a flat meta object and emits the whole
 * next object via `onChange`. The host decides where it mounts (a left-rail
 * panel beside the document canvas, a first step in a structured builder, or
 * the entire surface for meta-only entities like companies/offerings).
 */
import { FieldGroupEditor } from "@/components/studio/fields/FieldGroupEditor";
import type { SectionFieldDef } from "@/lib/studio/document/document-field-schema";

export interface MetaPanelProps {
  /** Section heading (e.g. "Course details"). */
  title?: string;
  /** Sub-line under the heading (e.g. "The metadata shown on the card."). */
  description?: string;
  fields: SectionFieldDef[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  className?: string;
}

export default function MetaPanel({
  title,
  description,
  fields,
  values,
  onChange,
  className,
}: MetaPanelProps) {
  return (
    <div className={className}>
      {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
      {description && (
        <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{description}</p>
      )}
      <FieldGroupEditor
        fields={fields}
        values={values}
        onChange={(key, value) => onChange({ ...values, [key]: value })}
      />
    </div>
  );
}
