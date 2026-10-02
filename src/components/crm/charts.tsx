"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";

export interface StageDatum {
  stageName: string;
  dealCount: number;
  totalDollars: number;
}

export function StageValueChart({ data }: { data: StageDatum[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="stageName" fontSize={12} tickLine={false} />
          <YAxis fontSize={12} tickLine={false} width={70} />
          <Tooltip
            formatter={(value: number) => [
              `$${value.toLocaleString()}`,
              "Value",
            ]}
          />
          <Bar dataKey="totalDollars" fill="hsl(222.2 47.4% 40%)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface ActivityDatum {
  date: string;
  count: number;
}

export function ActivityChart({ data }: { data: ActivityDatum[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(222.2 47.4% 40%)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(222.2 47.4% 40%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            fontSize={11}
            tickLine={false}
            minTickGap={24}
            tickFormatter={(d: string) => d.slice(5)}
          />
          <YAxis fontSize={12} tickLine={false} width={32} allowDecimals={false} />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="count"
            stroke="hsl(222.2 47.4% 40%)"
            fill="url(#activityFill)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
