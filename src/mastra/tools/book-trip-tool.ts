import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { getWeather } from "../lib/weather";

/**
 * A tool with a built-in human-in-the-loop suspend/resume flow.
 *
 * When the agent calls this tool it does NOT book immediately. It looks up the
 * destination weather for context, then calls `suspend()` to pause execution
 * and hand a confirmation prompt back to the caller. The run's state is
 * snapshotted to storage while suspended.
 *
 * A human then resumes the run (e.g. `agent.resumeStream({ confirmed: true }, ...)`)
 * with data matching `resumeSchema`. On resume, `execute` runs again — this time
 * `resumeData` is populated — and the tool finalizes or cancels the booking.
 */
export const bookTripTool = createTool({
  id: "book-trip",
  description:
    "Book a trip to a destination for a traveler. This tool pauses for explicit human confirmation before the booking is finalized.",
  inputSchema: z.object({
    destination: z.string().describe("City to travel to"),
    travelerName: z.string().describe("Name of the traveler"),
  }),
  outputSchema: z.object({
    status: z.enum(["booked", "cancelled"]),
    confirmationId: z.string().optional(),
    message: z.string(),
  }),
  // Payload surfaced to the caller while the tool is suspended.
  suspendSchema: z.object({
    reason: z.string(),
    destination: z.string(),
    travelerName: z.string(),
    weatherSummary: z.string(),
  }),
  // Shape the caller must provide when resuming the tool.
  resumeSchema: z.object({
    confirmed: z.boolean().describe("Whether the human confirmed the booking"),
  }),
  execute: async (inputData, context) => {
    const { resumeData, suspend } = context?.agent ?? {};

    // First pass — no decision yet. Gather context and SUSPEND for confirmation.
    if (resumeData?.confirmed === undefined) {
      const weather = await getWeather(inputData.destination);
      const weatherSummary = `${weather.conditions}, ${weather.temperature}°C (feels like ${weather.feelsLike}°C)`;

      // `suspend()` does not throw — return immediately after calling it.
      return suspend?.({
        reason: `Please confirm booking a trip to ${weather.location} for ${inputData.travelerName}.`,
        destination: weather.location,
        travelerName: inputData.travelerName,
        weatherSummary,
      });
    }

    // RESUMED — the human declined.
    if (!resumeData.confirmed) {
      return {
        status: "cancelled" as const,
        message: `Trip to ${inputData.destination} for ${inputData.travelerName} was cancelled.`,
      };
    }

    // RESUMED — the human confirmed. Finalize the booking.
    const confirmationId = `TRIP-${Date.now().toString(36).toUpperCase()}`;

    return {
      status: "booked" as const,
      confirmationId,
      message: `✈️ Trip to ${inputData.destination} booked for ${inputData.travelerName}. Confirmation: ${confirmationId}.`,
    };
  },
});
