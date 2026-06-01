import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";

import { weatherTool } from "../tools/weather-tool";
import { bookTripTool } from "../tools/book-trip-tool";

/**
 * A travel assistant. Every run — each LLM call and tool execution — is
 * automatically traced and exported to Arize (when configured).
 *
 * The agent can fetch weather and book trips. Booking goes through the
 * `bookTripTool`, which suspends mid-execution for human confirmation.
 */
export const travelAgent = new Agent({
  id: "travel-agent",
  name: "Travel Assistant",
  instructions: `
    You are a helpful travel assistant.

    - Use the weatherTool to report current conditions for a destination.
    - Use the bookTripTool to book a trip for a traveler. This tool pauses for
      human confirmation before finalizing the booking. Once it resumes, report
      the outcome (booked or cancelled) to the user, including any confirmation ID.
    - If a request is missing the destination or traveler name, ask for it.
    - Keep responses concise and friendly.
  `,
  model: "openai/gpt-4o-mini",
  tools: { weatherTool, bookTripTool },
  // With memory configured, resume a suspended tool (bookTripTool) from the
  // user's next message instead of requiring a manual resumeStream() call.
  defaultOptions: {
    autoResumeSuspendedTools: true,
  },
  // Conversation memory, persisted to its own SQLite file.
  memory: new Memory({
    storage: new LibSQLStore({
      id: "travel-agent-memory",
      url: "file:./travel-agent-memory.db",
    }),
  }), 
});
