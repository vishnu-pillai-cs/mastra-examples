# mastra-examples

A minimal [Mastra](https://mastra.ai) project demonstrating three things:

1. **A Mastra agent** — a "Travel Assistant" (`travelAgent`) with conversation memory.
2. **An Arize tracing exporter** — agent runs, LLM calls, and tool executions are exported to [Arize AX](https://arize.com) (or Phoenix) using OpenInference semantic conventions.
3. **A tool with a suspend/resume flow** — `bookTripTool` pauses mid-execution for human confirmation, then resumes.

## Project structure

```
src/
├─ example.ts                      # Runnable suspend → resume demo (single trace)
└─ mastra/
   ├─ index.ts                     # Mastra instance: agent, storage, Arize observability
   ├─ agents/travel-agent.ts       # The agent (tools + memory + auto-resume)
   ├─ tools/
   │  ├─ weather-tool.ts           # Basic tool: current weather
   │  └─ book-trip-tool.ts         # Tool WITH suspend/resume (human-in-the-loop)
   └─ lib/weather.ts               # Shared Open-Meteo helper
```

## Setup

```bash
npm install
cp .env.example .env   # then fill in OPENAI_API_KEY (and optionally Arize creds)
```

The agent uses the model string `openai/gpt-4o-mini`, so `OPENAI_API_KEY` is required.

## Run

**Mastra Studio** (interactive playground at http://localhost:4111):

```bash
npm run dev
```

**The suspend/resume demo** — asks the agent to book a trip, catches the suspended tool call, and resumes it:

```bash
npm run example
```

Expected output:

```
⏸  Tool suspended — confirmation required:
{ "reason": "Please confirm booking a trip to Tokyo for Alex.", ... }

   (initial run traceId: e98fa175e25d1d4757e69e20cd5a1e4c)

▶️  Resuming with { confirmed: true }...

✈️ Trip to Tokyo booked for Alex. Confirmation: TRIP-...
   (resumed run traceId: e98fa175e25d1d4757e69e20cd5a1e4c)
```

The two trace IDs match — see [Tracing across suspend/resume](#tracing-across-suspendresume).

## How the suspend/resume tool works

`bookTripTool` defines `suspendSchema` and `resumeSchema`. Inside `execute(inputData, context)`:

- On the **first** call there is no `context.agent.resumeData`, so the tool gathers context (the destination weather) and calls `context.agent.suspend(payload)`. The run state is snapshotted to storage and a `tool-call-suspended` chunk is emitted.
- A human resumes with `agent.resumeStream({ confirmed: true }, { runId })`. `execute` runs again — now `resumeData` is populated — and the tool finalizes (or cancels) the booking.

Storage (`LibSQLStore` → `mastra.db`) is required so the suspended run can be snapshotted and later resumed. See `src/mastra/tools/book-trip-tool.ts`.

> The demo forces the tool with `toolChoice: "required"` + `activeTools: ["bookTripTool"]` so it deterministically exercises the suspend/resume path. In a real app you'd let the model decide.

### Memory & automatic resumption

The agent has `@mastra/memory` enabled (persisted to `travel-agent-memory.db`) with `autoResumeSuspendedTools: true`. With memory, the agent can resume a suspended tool from the user's **next message** on the same thread — no manual `resumeStream()` needed:

```
User:  "Book a trip to Tokyo for Alex."
Agent: "Please confirm booking a trip to Tokyo for Alex."   ← bookTripTool suspended
User:  "Yes, go ahead."
Agent: "✈️ Trip to Tokyo booked for Alex. Confirmation: TRIP-..."   ← auto-resumed
```

Automatic resumption requires memory, the same memory thread/resource across messages, and a `resumeSchema` on the tool. The manual flow in `src/example.ts` (via `resumeStream({ runId })`) still works and is best for programmatic triggers like webhooks or button clicks.

## Arize tracing

Tracing is configured in `src/mastra/index.ts`, which sends traces to two exporters:

- `MastraStorageExporter` — local storage, viewable in Mastra Studio.
- `ArizeExporter` — Arize AX / Phoenix via OpenInference.

A `SensitiveDataFilter` span processor redacts secrets (passwords, tokens, keys) before export.

### Configuration

Set these in `.env`:

```bash
ARIZE_ENDPOINT=https://otlp.arize.com/v1/traces        # US collector
# ARIZE_ENDPOINT=https://otlp.eu-west-1a.arize.com/v1/traces  # EU collector
ARIZE_SPACE_ID=your-space-id
ARIZE_API_KEY=your-api-key
ARIZE_PROJECT_NAME=mastra-examples
```

- Use the collector endpoint that matches your space's region (US vs EU).
- `ARIZE_PROJECT_NAME` maps to the `openinference.project.name` resource attribute, which is how Arize routes spans to a project.
- If the Arize vars are unset, the exporter disables itself gracefully and traces still flow to local storage for Studio.

### Flushing in short-lived scripts

The Arize exporter **batches** spans (it flushes on a ~5s timer). Long-running processes like `mastra dev` flush automatically, but a short-lived script exits before the timer fires. `src/example.ts` therefore exports the `observability` instance from `src/mastra/index.ts` and calls `observability.shutdown()` before exiting, which flushes all buffered spans:

```ts
main()
  .then(() => observability.shutdown())   // flush spans to Arize before exit
  .catch(async (error) => {
    console.error(error);
    await observability.shutdown();
    process.exit(1);
  });
```

### Tracing across suspend/resume

By default a `resumeStream()` call starts a new trace. To keep the initial run and the resume in **one** trace, the demo captures the first run's `traceId` and passes it through `tracingOptions`:

```ts
const traceId = stream.traceId;

const resumed = await agent.resumeStream(
  { confirmed: true },
  {
    runId: stream.runId,
    tracingOptions: traceId ? { traceId } : undefined,
  },
);
```

In Arize you'll then see the suspended run and the resumed run grouped under the same trace.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start Mastra Studio |
| `npm run example` | Run the suspend → resume demo |
| `npm run build` | Bundle the Mastra app |
| `npm start` | Start the built server |
| `npm run typecheck` | `tsc --noEmit` |
