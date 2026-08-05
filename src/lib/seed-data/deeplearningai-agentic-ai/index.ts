import type { SeedPage } from "./types";
import { module00Foundations } from "./module-00-foundations";
import { module01Reflection } from "./module-01-reflection";
import { module02ToolUse } from "./module-02-tool-use";
import { module03Planning } from "./module-03-planning";
import { module04MultiAgent } from "./module-04-multi-agent";
import { module05Memory } from "./module-05-memory";
import { module06Frameworks } from "./module-06-frameworks";
import { module07EvalSafety } from "./module-07-eval-safety";

export type { SeedPage, GuideResource, ClassroomCategory } from "./types";

// All 48 pages for DeepLearningAI > Agentic AI, in display order (1-48).
// Organized into 8 modules mirroring Andrew Ng's four agentic design
// patterns (Reflection, Tool Use, Planning, Multi-Agent Collaboration) —
// see module-00-foundations.ts's header comment for the sourcing note.
export const ALL_PAGES: SeedPage[] = [
  ...module00Foundations, // 1-6:   Foundations
  ...module01Reflection, // 7-11:  Reflection
  ...module02ToolUse, // 12-18: Tool Use
  ...module03Planning, // 19-25: Planning
  ...module04MultiAgent, // 26-32: Multi-Agent Collaboration
  ...module05Memory, // 33-37: Memory Systems
  ...module06Frameworks, // 38-42: Frameworks & Tooling
  ...module07EvalSafety, // 43-48: Evaluation, Safety & Production
];
