import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DataPoint {
  date: string;
  count: number;
  value?: number;
  label?: string;
}

interface TrendLineChartProps {
  title: string;
  description?: string;
  data: DataPoint[];
  dataKey?: string;
  color?: string;
  height?: number;
  showLegend?: boolean;
  formatTooltip?: (value: any, name: string) => [string, string];
  formatXAxisLabel?: (value: string) => string;
  formatYAxisLabel?: (value: number) => string;
}

const TrendLineChart: React.FC<TrendLineChartProps> = ({
  title,
  description,
  data,
  dataKey = 'count',
  color = '#8884d8',
  height = 300,
  showLegend = true,
  formatTooltip,
  formatXAxisLabel,
  formatYAxisLabel,
}) => {
  const formatDate = (dateString: string) => {
    if (formatXAxisLabel) {
      return formatXAxisLabel(dateString);
    }
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  const formatValue = (value: number) => {
    if (formatYAxisLabel) {
      return formatYAxisLabel(value);
    }
    return value.toLocaleString();
  };

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      const value = payload[0].value;
      const formattedValue = formatTooltip 
        ? formatTooltip(value, payload[0].name)[0]
        : formatValue(value);
      
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium">{formatDate(label)}</p>
          <p className="text-sm text-primary">
            {`${payload[0].name}: ${formattedValue}`}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              className="text-xs fill-muted-foreground"
            />
            <YAxis 
              tickFormatter={formatValue}
              className="text-xs fill-muted-foreground"
            />
            <Tooltip content={customTooltip} />
            {showLegend && <Legend />}
            <Line 
              type="monotone" 
              dataKey={dataKey} 
              stroke={color} 
              strokeWidth={2}
              dot={{ fill: color, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: color, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default TrendLineChart;
