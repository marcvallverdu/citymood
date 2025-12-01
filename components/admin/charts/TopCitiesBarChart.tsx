"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CitySummary } from "@/lib/dashboard-types";

interface TopCitiesBarChartProps {
  data: CitySummary[];
}

export default function TopCitiesBarChart({ data }: TopCitiesBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        No data available
      </div>
    );
  }

  // Capitalize city names for display
  const formattedData = data.map((item) => ({
    ...item,
    city: item.city.charAt(0).toUpperCase() + item.city.slice(1),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={formattedData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis
          dataKey="city"
          type="category"
          tick={{ fontSize: 12 }}
          width={100}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        />
        <Bar dataKey="count" name="Jobs" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
