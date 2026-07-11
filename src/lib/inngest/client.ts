import { Inngest } from "inngest";

// Background job runner for anything that outlasts a normal request —
// fetching a page, transcribing a video, parsing a 50MB PDF, then running
// it through the AI draft step (PLAN.md §5). Needs the Inngest Dev Server
// running locally (`npx inngest-cli dev`) to actually execute functions in
// development; in production it's driven by Inngest Cloud hitting
// /api/inngest. See SETUP.md.
export const inngest = new Inngest({ id: "brainbank" });
