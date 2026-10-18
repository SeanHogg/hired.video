import type { ReactElement } from "react";
import type { TFunction } from "i18next";
import type { ContentTemplate } from "@/lib/studio/templates/catalog";

/** Template id → thumbnail renderer. Receives the caller's `t` so the
 *  decorative mock-slide copy is localized (renderers are plain functions,
 *  not components, so they can't call hooks themselves). */
export type TemplateThumbMap = Partial<Record<ContentTemplate, (t: TFunction) => ReactElement>>;
