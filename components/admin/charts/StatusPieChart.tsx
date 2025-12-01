"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import type { JobStatus } from "@/lib/dashboard-types";

interface StatusPieChartProps {
  data: Record<JobStatus, number>;
}

const COLORS: Record<JobStatus, string> = {
  pending: "#eab308",
  processing: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
};

const LABELS: Record<JobStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

export default function StatusPieChart({ data }: StatusPieChartProps) {
  const chartData = Object.entries(data)
    .filter(([, value]) => value > 0)
    .map(([status, value]) => ({
      name: LABELS[status as JobStatus],
      value,
      color: COLORS[status as JobStatus],
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
