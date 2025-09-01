import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PieDataPoint {
  name: string;
  value: number;
  color?: string;
}

interface MetricsPieChartProps {
  title: string;
  description?: string;
  data: PieDataPoint[];
  height?: number;
  showLegend?: boolean;
  colors?: string[];
  formatTooltip?: (value: number, name: string) => [string, string];
  innerRadius?: number;
  outerRadius?: number;
}

const DEFAULT_COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', 
  '#82CA9D', '#FFC658', '#FF7C7C', '#8DD1E1', '#D084D0'
];

const MetricsPieChart: React.FC<MetricsPieChartProps> = ({
  title,
  description,
  data,
  height = 300,
  showLegend = true,
  colors = DEFAULT_COLORS,
  formatTooltip,
  innerRadius = 0,
  outerRadius = 80,
}) => {
  const chartData = data.map((item, index) => ({
    ...item,
    color: item.color || colors[index % colors.length],
  }));

  const customTooltip = ({ active, payload }: any) => {
    if (active && payload?.length) {
      const data = payload[0].payload;
      const value = payload[0].value;
      const name = data.name;
      
      const formattedValue = formatTooltip 
        ? formatTooltip(value, name)[0]
        : value.toLocaleString();
      
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium">{name}</p>
          <p className="text-sm text-primary">
            {`Value: ${formattedValue}`}
          </p>
        </div>
      );
    }
    return null;
  };

  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null; // Don't show labels for slices smaller than 5%
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        className="text-xs font-medium"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomizedLabel}
              outerRadius={outerRadius}
              innerRadius={innerRadius}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={customTooltip} />
            {showLegend && (
              <Legend 
                verticalAlign="bottom" 
                height={36}
                formatter={(value, entry: any) => (
                  <span style={{ color: entry.color }}>{value}</span>
                )}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default MetricsPieChart;
