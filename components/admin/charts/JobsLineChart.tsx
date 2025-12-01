"use client";

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
import type { TimeSeriesPoint } from "@/lib/dashboard-types";

interface JobsLineChartProps {
  data: TimeSeriesPoint[];
}

export default function JobsLineChart({ data }: JobsLineChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        No data available
      </div>
    );
  }

  // Format date for display
  const formattedData = data.map((point) => ({
    ...point,
    displayDate: new Date(point.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="displayDate"
          tick={{ fontSize: 12 }}
          className="text-gray-600 dark:text-gray-400"
        />
        <YAxis tick={{ fontSize: 12 }} className="text-gray-600 dark:text-gray-400" />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="images"
          name="Images"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="videos"
          name="Videos"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="cached"
          name="Cached"
          stroke="#22c55e"
          strokeWidth={2}
          dot={false}
          strokeDasharray="5 5"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
