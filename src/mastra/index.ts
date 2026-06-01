import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import {
  Observability,
  MastraStorageExporter,
  SensitiveDataFilter,
} from "@mastra/observability";
import { ArizeExporter } from "@mastra/arize";

import { travelAgent } from "./agents/travel-agent";

const exporters = [
  // Persists observability events to storage, viewable in Mastra Studio.
  new MastraStorageExporter(),
  // Sends traces to Arize.
  new ArizeExporter({
    endpoint: process.env.ARIZE_ENDPOINT,
    apiKey: process.env.ARIZE_API_KEY,
    spaceId: process.env.ARIZE_SPACE_ID,
    projectName: process.env.ARIZE_PROJECT_NAME
  }),
];


export const observability = new Observability({
  configs: {
    default: {
      serviceName: "mastra-examples",
      exporters,
      spanOutputProcessors: [
        new SensitiveDataFilter(),
      ],
    },
  },
});

export const mastra = new Mastra({
  agents: { travelAgent },
  storage: new LibSQLStore({
    id: "mastra-examples",
    url: "file:./mastra.db",
  }),
  observability,
});
