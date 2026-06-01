import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getWeather } from "../lib/weather";

/**
 * A tool the weather agent calls to fetch current conditions for a location.
 * Tool executions are automatically traced and exported to Arize.
 */
export const weatherTool = createTool({
  id: "get-weather",
  description: "Get the current weather for a given location",
  inputSchema: z.object({
    location: z.string().describe("City name, e.g. 'London' or 'New York'"),
  }),
  outputSchema: z.object({
    location: z.string(),
    temperature: z.number().describe("Temperature in °C"),
    feelsLike: z.number().describe("Apparent temperature in °C"),
    humidity: z.number().describe("Relative humidity in %"),
    windSpeed: z.number().describe("Wind speed in km/h"),
    conditions: z.string(),
  }),
  execute: async ({ location }) => {
    return await getWeather(location);
  },
});
