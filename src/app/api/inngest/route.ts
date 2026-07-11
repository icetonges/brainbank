import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { ingestSource } from "@/lib/inngest/ingest-source";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [ingestSource],
});
