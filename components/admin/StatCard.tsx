interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  color?: "blue" | "green" | "purple" | "orange" | "red";
}

const colorClasses = {
  blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
  green: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
  purple: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800",
  orange: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800",
  red: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
};

const textColorClasses = {
  blue: "text-blue-600 dark:text-blue-400",
  green: "text-green-600 dark:text-green-400",
  purple: "text-purple-600 dark:text-purple-400",
  orange: "text-orange-600 dark:text-orange-400",
  red: "text-red-600 dark:text-red-400",
};

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  color = "blue",
}: StatCardProps) {
  return (
    <div
      className={`rounded-lg border p-4 ${colorClasses[color]}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          {title}
        </span>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <div className={`mt-2 text-3xl font-bold ${textColorClasses[color]}`}>
        {value}
      </div>
      {subtitle && (
        <div className="mt-1 text-sm text-gray-500 dark:text-gray-500">
          {subtitle}
        </div>
      )}
    </div>
  );
}
