import DashboardContent from "@/components/admin/DashboardContent";

export const metadata = {
  title: "Admin Dashboard - CityMood",
  description: "Observability dashboard for CityMood API",
};

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            CityMood Dashboard
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Monitor devices, API keys, and generated content
          </p>
        </div>
        <DashboardContent />
      </main>
    </div>
  );
}
