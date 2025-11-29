// Weather category types
export type WeatherCategory =
  | "sunny"
  | "cloudy"
  | "foggy"
  | "drizzle"
  | "rainy"
  | "snowy"
  | "sleet"
  | "stormy";

// Map WeatherAPI condition codes to simplified categories
// Reference: https://www.weatherapi.com/docs/weather_conditions.json
const conditionCodeToCategory: Record<number, WeatherCategory> = {
  // Sunny / Clear
  1000: "sunny",

  // Cloudy
  1003: "cloudy", // Partly cloudy
  1006: "cloudy", // Cloudy
  1009: "cloudy", // Overcast

  // Foggy / Mist
  1030: "foggy", // Mist
  1135: "foggy", // Fog
  1147: "foggy", // Freezing fog

  // Drizzle
  1150: "drizzle", // Patchy light drizzle
  1153: "drizzle", // Light drizzle
  1168: "drizzle", // Freezing drizzle
  1171: "drizzle", // Heavy freezing drizzle

  // Rain
  1063: "rainy", // Patchy rain possible
  1180: "rainy", // Patchy light rain
  1183: "rainy", // Light rain
  1186: "rainy", // Moderate rain at times
  1189: "rainy", // Moderate rain
  1192: "rainy", // Heavy rain at times
  1195: "rainy", // Heavy rain
  1198: "rainy", // Light freezing rain
  1201: "rainy", // Moderate or heavy freezing rain
  1240: "rainy", // Light rain shower
  1243: "rainy", // Moderate or heavy rain shower
  1246: "rainy", // Torrential rain shower

  // Snow
  1066: "snowy", // Patchy snow possible
  1114: "snowy", // Blowing snow
  1117: "snowy", // Blizzard
  1210: "snowy", // Patchy light snow
  1213: "snowy", // Light snow
  1216: "snowy", // Patchy moderate snow
  1219: "snowy", // Moderate snow
  1222: "snowy", // Patchy heavy snow
  1225: "snowy", // Heavy snow
  1255: "snowy", // Light snow showers
  1258: "snowy", // Moderate or heavy snow showers

  // Sleet / Ice
  1069: "sleet", // Patchy sleet possible
  1072: "sleet", // Patchy freezing drizzle possible
  1204: "sleet", // Light sleet
  1207: "sleet", // Moderate or heavy sleet
  1237: "sleet", // Ice pellets
  1249: "sleet", // Light sleet showers
  1252: "sleet", // Moderate or heavy sleet showers
  1261: "sleet", // Light showers of ice pellets
  1264: "sleet", // Moderate or heavy showers of ice pellets

  // Thunderstorms
  1087: "stormy", // Thundery outbreaks possible
  1273: "stormy", // Patchy light rain with thunder
  1276: "stormy", // Moderate or heavy rain with thunder
  1279: "stormy", // Patchy light snow with thunder
  1282: "stormy", // Moderate or heavy snow with thunder
};

/**
 * Get the simplified weather category from a WeatherAPI condition code
 * Falls back to "cloudy" for unknown codes
 */
export function getWeatherCategory(conditionCode: number): WeatherCategory {
  return conditionCodeToCategory[conditionCode] || "cloudy";
}

/**
 * Get a human-readable description for a weather category
 */
export function getCategoryDescription(category: WeatherCategory): string {
  const descriptions: Record<WeatherCategory, string> = {
    sunny: "sunny",
    cloudy: "cloudy",
    foggy: "foggy",
    drizzle: "drizzly",
    rainy: "rainy",
    snowy: "snowy",
    sleet: "icy",
    stormy: "stormy",
  };
  return descriptions[category];
}
