import DeviceDetail from "@/components/admin/DeviceDetail";

export const metadata = {
  title: "Device Details - CityMood Dashboard",
  description: "View device details and job history",
};

interface PageProps {
  params: Promise<{ keyHash: string }>;
}

export default async function DeviceDetailPage({ params }: PageProps) {
  const { keyHash } = await params;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <main className="container mx-auto px-4 py-8">
        <DeviceDetail keyHash={keyHash} />
      </main>
    </div>
  );
}
