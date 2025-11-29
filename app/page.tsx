import CityMoodForm from "@/components/CityMoodForm";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
            CityMood
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
            Enter a city name to see an AI-generated isometric illustration
            featuring its landmarks in the current weather conditions.
          </p>
        </div>

        <CityMoodForm />

        <footer className="mt-16 text-center text-sm text-gray-500 dark:text-gray-500">
          <p>
            Powered by Gemini AI • Weather data from WeatherAPI
          </p>
        </footer>
      </main>
    </div>
  );
}
