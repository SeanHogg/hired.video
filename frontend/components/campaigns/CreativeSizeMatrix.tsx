/**
 * Per-campaign format-category matrix (#1133).
 *
 * Rows of the catalog (`groupFormatsByCategory`) become columns; the
 * cell is the asset count. Zero cells are gaps (amber) so a GDN / social
 * campaign that is missing a family is obvious at a glance.
 */

import { categoryMatrix, type PixelSize } from "./creative-size";

export interface CreativeSizeMatrixProps {
  assets: PixelSize[];
}

export function CreativeSizeMatrix({ assets }: CreativeSizeMatrixProps) {
  const rows = categoryMatrix(assets);
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {rows.map((row) => (
              <th key={row.category} className="text-left font-medium pr-2 py-1 whitespace-nowrap">
                {row.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {rows.map((row) => (
              <td
                key={row.category}
                data-gap={row.gap ? "true" : "false"}
                title={row.gap ? `No ${row.label} assets` : undefined}
                className={`pr-2 py-1 tabular-nums ${row.gap ? "text-amber-800 bg-amber-50" : ""}`}
              >
                {row.count}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
