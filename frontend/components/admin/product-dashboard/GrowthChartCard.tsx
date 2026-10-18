import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toGrowthChartData } from "./helpers";
import type { GrowthPoint } from "./types";

interface GrowthChartCardProps {
  title: string;
  description: string;
  data: GrowthPoint[] | undefined;
  stroke: string;
  /** Overview variant: shorter chart, smaller ticks, responsive heading sizes. */
  compact?: boolean;
}

/** 90-day growth line chart card shared by the overview and per-entity tabs. */
export function GrowthChartCard({ title, description, data, stroke, compact = false }: GrowthChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={compact ? "text-lg sm:text-xl" : undefined}>{title}</CardTitle>
        <CardDescription className={compact ? "text-sm" : undefined}>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={compact ? 250 : 300}>
          <LineChart data={toGrowthChartData(data)}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: compact ? 10 : 12 }}
              interval="preserveStartEnd"
            />
            {compact ? <YAxis tick={{ fontSize: 10 }} /> : <YAxis />}
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="count"
              stroke={stroke}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
