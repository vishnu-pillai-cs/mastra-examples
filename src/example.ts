/**
 * Demonstrates the bookTripTool's suspend/resume flow end-to-end.
 *
 *   npm run example
 *
 * Requires OPENAI_API_KEY in .env. Traces are exported to Arize if configured
 * (see .env.example), and always to local storage for Mastra Studio.
 */
import { mastra, observability } from "./mastra/index";

async function main() {
  const agent = mastra.getAgent("travelAgent");

  // 1. Ask the agent to book a trip. The bookTripTool runs, gathers context,
  //    then suspends — waiting for a human to confirm.
  //    `toolChoice`/`activeTools` force the booking tool so this demo is
  //    deterministic; in a real app you'd let the model decide.
  const stream = await agent.stream("Book a trip to Tokyo for Alex.", {
    toolChoice: "required",
    activeTools: ["bookTripTool"],
  });

  let suspended = false;
  for await (const chunk of stream.fullStream as AsyncIterable<any>) {
    if (chunk.type === "tool-call-suspended") {
      suspended = true;
      console.log("\n⏸  Tool suspended — confirmation required:");
      console.log(JSON.stringify(chunk.payload.suspendPayload, null, 2));
    }
  }

  if (!suspended) {
    console.log(
      "\nThe agent did not suspend a tool call. Try rephrasing the request.",
    );
    return;
  }

  // Capture the trace ID from the initial run so the resume can join the SAME
  // trace instead of starting a new one.
  const traceId = stream.traceId;
  console.log(`\n   (initial run traceId: ${traceId ?? "unavailable"})`);

  // 2. A human approves. Resume the SAME run, passing the trace ID via
  //    tracingOptions so the resume's spans attach to the original trace.
  console.log("\n▶️  Resuming with { confirmed: true }...\n");
  const resumed = await agent.resumeStream(
    { confirmed: true },
    {
      runId: stream.runId,
      tracingOptions: traceId ? { traceId } : undefined,
    },
  );

  for await (const chunk of resumed.textStream as AsyncIterable<string>) {
    process.stdout.write(chunk);
  }
  process.stdout.write("\n");

  // Both IDs should match — the resume is part of the same trace.
  console.log(`   (resumed run traceId: ${resumed.traceId ?? "unavailable"})`);
}

main()
  .then(() => observability.shutdown())
  .catch(async (error) => {
    console.error(error);
    await observability.shutdown();
    process.exit(1);
  });
