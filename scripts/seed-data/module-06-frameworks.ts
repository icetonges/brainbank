import type { SeedPage } from "./types";

// Module 6 — Frameworks & Tooling (5 pages, order 38-42).
export const module06Frameworks: SeedPage[] = [
  {
    order: 38,
    key: "langgraph-overview",
    titleEn: "LangGraph: Graph-Based Agent Orchestration",
    titleZh: "LangGraph：基于图的智能体编排",
    category: "skill",
    summaryEn:
      "LangGraph models an agent as an explicit graph of nodes and edges with shared state — trading some simplicity for precise, inspectable control over complex control flow.",
    summaryZh: "LangGraph 把智能体建模为一张由节点、边和共享状态构成的显式图——用一定的简洁性换取对复杂控制流的精确、可检视的掌控。",
    tags: ["agentic-ai", "frameworks", "langgraph", "deeplearningai"],
    bodyEn: `LangGraph (from the LangChain team) represents an agent as a **graph**: nodes are units of work (an LLM call, a tool call, a sub-agent), edges define what runs next, and a shared **state object** flows through the whole graph, with each node reading the parts it needs and writing updates back — the blackboard pattern (module 4, page 31) as a first-class framework primitive.

What this buys you over a hand-rolled while-loop:

- **Explicit, inspectable control flow.** Because the graph structure is declared up front, you can visualize it, and conditional edges (routing based on state) make branching logic a named part of the graph rather than buried in if/else chains.
- **Built-in support for cycles.** Unlike many workflow tools built for strictly linear DAGs, LangGraph is designed for the loop-back edges agent architectures actually need (re-planning, retry-on-failure, reflection loops).
- **Checkpointing and human-in-the-loop.** State can be persisted between steps, enabling pause/resume, and specific nodes can be marked to require human approval before proceeding — directly useful for the guardrail patterns covered in module 7.
- **Multi-agent support out of the box.** Sub-graphs and supervisor patterns (module 4's orchestrator-worker and hierarchical patterns) map onto LangGraph's nesting model directly.

The trade-off: the graph abstraction has a real learning curve, and for a genuinely simple single-tool-call agent, it can be more machinery than the task needs — reach for it once your control flow has real branches, loops, or multiple agents to coordinate, not for a linear three-step chain.`,
    bodyZh: `LangGraph（来自 LangChain 团队）把一个智能体表示为一张**图**：节点是各个工作单元（一次 LLM 调用、一次工具调用、一个子智能体），边定义了接下来运行什么，一个共享的**状态对象**在整张图中流动，每个节点读取自己需要的部分，并把更新写回——这正是黑板模式（第 4 模块第 31 页）作为一等公民原语落地在框架中的体现。

相比手写的 while 循环，它带来了以下好处：

- **显式、可检视的控制流。** 由于图结构是预先声明好的，你可以将其可视化，条件边（基于状态进行路由）让分支逻辑成为图中一个有名字的组成部分，而不是深藏在 if/else 链条里。
- **对循环的内置支持。** 与许多为严格线性 DAG 设计的工作流工具不同，LangGraph 天生就是为智能体架构真正需要的回环边（重新规划、失败重试、反思循环）而设计的。
- **检查点与人机协同（Human-in-the-loop）。** 状态可以在各步骤之间持久化，从而支持暂停/恢复，特定节点还可以被标记为需要人工批准才能继续——这直接对应第 7 模块讲到的护栏模式。
- **开箱即用的多智能体支持。** 子图和主管模式（第 4 模块的编排者—工作者与层级模式）可以直接映射到 LangGraph 的嵌套模型上。

代价在于：这种图抽象有一定的学习曲线，对于一个真正简单的单次工具调用型智能体来说，它可能是超出任务实际需要的"重装备"——当你的控制流确实存在分支、循环，或需要协调多个智能体时再采用它，而不是用于一条线性的三步链条。`,
    learningMapEn: `- Understand the node/edge/shared-state graph model
- Learn 4 concrete benefits: inspectable control flow, cycles, checkpointing/HITL, multi-agent support
- Weigh the learning curve against task complexity before adopting it
- Connect LangGraph's primitives back to patterns from earlier modules`,
    learningMapZh: `- 理解节点/边/共享状态的图模型
- 掌握 4 个具体好处：可检视的控制流、循环支持、检查点/人机协同、多智能体支持
- 在采用前权衡学习曲线与任务复杂度
- 把 LangGraph 的原语与前面模块讲过的模式联系起来`,
    handsOnEn: `1. Build from scratch, then rebuild the same simple agent as a LangGraph graph.
2. Add a conditional edge that routes based on a piece of shared state.
3. Add a loop-back edge implementing a retry-on-failure or reflection cycle.
4. Mark one node as requiring human approval before proceeding.`,
    handsOnZh: `1. 先从零构建一个简单智能体，再把它改造成一张 LangGraph 图。
2. 添加一条基于共享状态某个字段进行路由的条件边。
3. 添加一条实现"失败重试"或"反思循环"的回环边。
4. 将某个节点标记为需要人工批准后才能继续执行。`,
    resources: [
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "Official docs: graph API, state, checkpointing, human-in-the-loop, and multi-agent patterns.",
      },
      {
        title: "AI Agents in LangGraph — DeepLearning.AI",
        url: "https://www.deeplearning.ai/courses/ai-agents-in-langgraph",
        description: "Build an agent from scratch, then rebuild it in LangGraph — taught by LangChain's founder.",
      },
    ],
  },
  {
    order: 39,
    key: "crewai-overview",
    titleEn: "CrewAI: Role-Based Multi-Agent Teams",
    titleZh: "CrewAI：基于角色的多智能体团队",
    category: "skill",
    summaryEn:
      "CrewAI organizes multi-agent systems around role-playing agents with defined goals and backstories, optimized for getting a coordinated team running quickly.",
    summaryZh: "CrewAI 围绕带有明确目标和背景设定、扮演特定角色的智能体来组织多智能体系统，专为快速搭建一支协同工作的团队而优化。",
    tags: ["agentic-ai", "frameworks", "crewai", "deeplearningai"],
    bodyEn: `CrewAI takes a different starting metaphor from LangGraph's graph: instead of nodes and edges, you define a **crew** of agents, each with a role, goal, and backstory (yes, literally — role-prompting is a first-class configuration field, not just a convention), assign each a set of tasks, and choose a **process** (sequential or hierarchical) that governs how they hand off work.

This maps directly onto the multi-agent patterns from module 4:

- **Role definition** is CrewAI's version of the specialized-worker pattern (page 26) — each agent's role/goal/backstory *is* its scoped system prompt.
- **Sequential process** is the plan-and-execute pipeline (module 3) applied to agent hand-offs rather than tool calls.
- **Hierarchical process** adds a manager agent that delegates and reviews — CrewAI's built-in version of the orchestrator-worker pattern (page 27), including an optional human-in-the-loop review step.
- **Tasks with expected_output** enforce the "structured, not free-text" hand-off discipline from the communication-protocols page (module 4, page 30) as a required field, not an afterthought.

Where CrewAI tends to win: getting a role-based multi-agent team running quickly, with sensible defaults for coordination already built in — well suited to tasks that map naturally onto a small team of named specialists (researcher, writer, editor). Where LangGraph tends to win: fine-grained control over branching, cycles, and state that don't fit a role-and-task metaphor cleanly. Many teams use both — CrewAI-style crews as sub-graphs within a larger LangGraph orchestration.`,
    bodyZh: `CrewAI 采用了与 LangGraph 的"图"不同的起始隐喻：不是节点和边，而是定义一支**团队（crew）**，其中每个智能体都有角色、目标和背景故事（没错，字面意义上的背景故事——角色扮演式 prompt 在这里是一个一等公民的配置字段，而不仅仅是一种约定俗成的做法），为每个智能体分配一组任务，并选择一种**流程（process）**（顺序式或层级式）来决定它们之间如何交接工作。

这与第 4 模块讲到的多智能体模式直接对应：

- **角色定义**是 CrewAI 版本的专职工作者模式（第 26 页）——每个智能体的角色/目标/背景故事，本身*就是*它范围明确的系统 prompt。
- **顺序式流程（Sequential process）**是把先规划后执行流水线（第 3 模块）应用到智能体交接上，而不是应用到工具调用上。
- **层级式流程（Hierarchical process）**加入了一个负责委派和审阅的管理智能体——这是 CrewAI 内置的编排者—工作者模式版本（第 27 页），并可选地包含一个人机协同审阅步骤。
- **带 expected_output 的任务（Tasks with expected_output）**把"结构化而非自由文本"的交接纪律（第 4 模块第 30 页，通信协议一页）强制变成了一个必填字段，而不是事后补充的东西。

CrewAI 往往在以下场景中更具优势：快速搭建起一支基于角色的多智能体团队，并已内置了合理的协调默认设置——非常适合那些能自然映射到一支由若干命名专家（研究员、写作者、编辑）组成的小型团队的任务。而 LangGraph 往往在以下场景中更具优势：对分支、循环和状态需要精细控制，而这些又难以干净地套入"角色与任务"这一隐喻的场景。许多团队会同时使用两者——把 CrewAI 风格的团队作为子图，嵌入到更大的 LangGraph 编排结构中。`,
    learningMapEn: `- Learn CrewAI's role/goal/backstory agent definition model
- Map CrewAI's sequential/hierarchical processes onto module 3/4 patterns
- Understand expected_output as enforced structured hand-off
- Compare when CrewAI wins vs. when LangGraph wins`,
    learningMapZh: `- 掌握 CrewAI 的角色/目标/背景故事智能体定义模型
- 把 CrewAI 的顺序式/层级式流程对应到第 3/4 模块的模式上
- 理解 expected_output 如何强制实现结构化交接
- 比较 CrewAI 与 LangGraph 各自更具优势的场景`,
    handsOnEn: `1. Define a small crew (2-3 agents) with role, goal, and backstory for each.
2. Assign tasks with an explicit expected_output for each agent.
3. Run the crew with a sequential process, then try a hierarchical process with a manager agent.
4. Decide, for your own project, whether a role-and-task metaphor fits better than a graph metaphor.`,
    handsOnZh: `1. 定义一个小型团队（2—3 个智能体），为每个智能体设定角色、目标和背景故事。
2. 为每个智能体分配任务，并明确设定 expected_output。
3. 先以顺序式流程运行该团队，再尝试引入一个管理智能体的层级式流程。
4. 针对你自己的项目，判断"角色与任务"这一隐喻是否比"图"这一隐喻更适合。`,
    resources: [
      {
        title: "CrewAI documentation",
        url: "https://docs.crewai.com/",
        description: "Official docs: agents, tasks, crews, processes, and tool integration.",
      },
      {
        title: "Andrew Ng on Multi-agent collaboration (The Batch)",
        url: "https://x.com/AndrewYNg/status/1773393357022298617",
        description: "The design-pattern framing CrewAI's role-based crews are a direct implementation of.",
      },
    ],
  },
  {
    order: 40,
    key: "autogen-overview",
    titleEn: "AutoGen: Conversational Multi-Agent Framework",
    titleZh: "AutoGen：对话式多智能体框架",
    category: "skill",
    summaryEn:
      "AutoGen (Microsoft Research) models multi-agent systems as agents having a conversation with each other, with group-chat patterns and code execution as first-class features.",
    summaryZh: "AutoGen（微软研究院）把多智能体系统建模为智能体之间的相互对话，群聊模式和代码执行是其一等公民特性。",
    tags: ["agentic-ai", "frameworks", "autogen", "deeplearningai"],
    bodyEn: `AutoGen's core metaphor is a **conversation**: agents are participants that send and receive messages, and multi-agent coordination is literally a chat — one-on-one between two agents, or a **group chat** among several, with a configurable "speaker selection" mechanism deciding who talks next.

This maps onto earlier modules distinctly from LangGraph's graph or CrewAI's crew:

- **Two-agent conversations** are a natural fit for the debate and critique-and-defend patterns (module 4, page 28) — an "assistant" agent and a "critic" agent literally messaging back and forth until the critic approves.
- **Group chat with a manager** is AutoGen's version of orchestrator-worker (page 27), where the group chat manager decides which agent speaks next based on the conversation so far, rather than a fixed sequential process.
- **Built-in code execution agents** make AutoGen a strong fit for tasks where Tool Use (module 2) is centrally about running and iterating on code — a "coder" agent proposes code, an "executor" agent runs it in a sandbox (page 16) and reports results back into the conversation.
- **Termination conditions** are explicit and configurable (max turns, a specific phrase, a custom check) — directly addressing the "avoiding coordination failures" concerns from module 4, page 32 (infinite ping-pong, nobody owning "done").

AutoGen tends to fit well when a task is naturally conversational (iterative code review, back-and-forth negotiation between roles) more than when it's naturally a fixed pipeline or a complex branching graph — the conversational metaphor is a genuine strength for some tasks and unnecessary overhead for others.`,
    bodyZh: `AutoGen 的核心隐喻是**对话**：智能体是相互发送和接收消息的参与者，多智能体协调本质上就是一场聊天——可以是两个智能体之间的一对一对话，也可以是多个智能体之间的**群聊**，由一个可配置的"发言人选择"机制决定接下来该谁发言。

这与 LangGraph 的图、CrewAI 的团队相比，以一种明显不同的方式对应到前面的模块中：

- **双智能体对话**天然适合辩论和批评—辩护模式（第 4 模块第 28 页）——一个"助手"智能体和一个"评审"智能体字面意义上地来回发消息，直到评审通过为止。
- **带管理者的群聊**是 AutoGen 版本的编排者—工作者模式（第 27 页），由群聊管理者根据到目前为止的对话内容决定接下来该由哪个智能体发言，而不是按固定的顺序流程来执行。
- **内置的代码执行智能体**使得 AutoGen 非常适合那些"工具使用"（第 2 模块）核心内容是运行和迭代代码的任务——一个"编码者"智能体提出代码方案，一个"执行者"智能体在沙箱中运行它（第 16 页），并把结果反馈回对话中。
- **终止条件**是显式且可配置的（最大轮次、特定短语、自定义检查）——这直接呼应了第 4 模块第 32 页"避免协调失败"中提到的问题（无限乒乓、无人负责"完成"）。

当一个任务天然具有对话性质（迭代式代码评审、角色之间的来回协商）时，AutoGen 往往更契合；而当任务天然是一条固定流水线或一张复杂的分支图时则不然——对话式隐喻对某些任务而言是真正的优势，对另一些任务而言则是不必要的开销。`,
    learningMapEn: `- Learn AutoGen's conversation/group-chat metaphor
- Map two-agent chat to debate/critique-defend, and group chat to orchestrator-worker
- Understand built-in code-execution agents as a Tool Use fit
- Learn explicit termination conditions as a coordination-failure defense`,
    learningMapZh: `- 掌握 AutoGen 的对话/群聊隐喻
- 把双智能体对话对应到辩论/批评—辩护，把群聊对应到编排者—工作者
- 理解内置代码执行智能体对"工具使用"场景的契合度
- 掌握显式终止条件作为协调失败的防御手段`,
    handsOnEn: `1. Set up a two-agent conversation: an assistant agent and a critic agent.
2. Run it until the critic approves, and inspect the full message-by-message transcript.
3. Add a coder + code-executor agent pair for a task involving actual computation.
4. Configure an explicit termination condition (max turns or a stop phrase) and test that it fires.`,
    handsOnZh: `1. 搭建一个双智能体对话：一个助手智能体和一个评审智能体。
2. 运行直到评审通过，检查完整的逐条消息记录。
3. 为一个涉及真实计算的任务加入"编码者 + 代码执行者"智能体组合。
4. 配置一个显式的终止条件（最大轮次或停止短语），并测试它是否会被触发。`,
    resources: [
      {
        title: "AutoGen — Microsoft Research",
        url: "https://microsoft.github.io/autogen/",
        description: "Official docs: conversational agents, group chat, code execution, and termination conditions.",
      },
      {
        title: "Improving Factuality and Reasoning in Language Models through Multiagent Debate",
        url: "https://arxiv.org/abs/2305.14325",
        description: "Academic grounding for the debate-style patterns AutoGen's conversations naturally support.",
      },
    ],
  },
  {
    order: 41,
    key: "openai-agents-sdk",
    titleEn: "OpenAI Agents SDK and the Assistants API",
    titleZh: "OpenAI Agents SDK 与 Assistants API",
    category: "api",
    summaryEn:
      "OpenAI's own agent-building tools provide managed infrastructure — hosted state, built-in tools, handoffs — as an alternative to assembling one from lower-level primitives yourself.",
    summaryZh: "OpenAI 自家的智能体构建工具提供了托管基础设施——托管状态、内置工具、任务交接——作为你自行用底层原语拼装智能体之外的另一种选择。",
    tags: ["agentic-ai", "frameworks", "openai", "deeplearningai"],
    bodyEn: `Where LangGraph, CrewAI, and AutoGen are frameworks you run yourself on top of any model provider's API, OpenAI's Agents SDK and (its predecessor) the Assistants API are provider-managed: OpenAI hosts the conversation state, the tool-calling loop, and (for Assistants) file storage and a built-in code-interpreter/retrieval tool, so your application code is thinner.

Key pieces:

- **Managed threads/state.** Conversation history persists server-side rather than your application re-sending the full transcript on every call — directly addresses part of the memory-management burden from module 5.
- **Built-in tools.** Code interpreter (a managed sandbox, module 2 page 16) and file search (managed retrieval, module 2 page 18) ship as configuration rather than infrastructure you build and operate yourself.
- **Handoffs (Agents SDK).** A first-class primitive for one agent to explicitly transfer a conversation to another — a lighter-weight, provider-native version of the orchestrator-worker hand-off (module 4, page 27).
- **Guardrails (Agents SDK).** Configurable input/output validation hooks — a built-in home for some of the guardrail patterns covered in module 7.

The trade-off versus LangGraph/CrewAI/AutoGen: less flexibility to swap in a different model provider or heavily customize control flow, in exchange for less infrastructure to build and operate yourself. A reasonable default question when choosing: are you committed to one provider's models and want to minimize infrastructure, or do you need model portability and fine-grained control over orchestration? The former favors provider-managed tooling; the latter favors an open framework.`,
    bodyZh: `LangGraph、CrewAI 和 AutoGen 是你在任意模型厂商 API 之上自行运行的框架，而 OpenAI 的 Agents SDK 及其前身 Assistants API 则是由厂商托管的：OpenAI 负责托管对话状态、工具调用循环，以及（对 Assistants 而言）文件存储和内置的代码解释器/检索工具，使你的应用代码更为精简。

关键组成部分：

- **托管的线程/状态。** 对话历史保存在服务端，而不需要你的应用在每次调用时重新发送完整的对话记录——直接解决了第 5 模块中部分记忆管理负担。
- **内置工具。** 代码解释器（一个托管沙箱，对应第 2 模块第 16 页）和文件搜索（托管检索，对应第 2 模块第 18 页），以配置项的形式提供，而不需要你自行构建和运维相应的基础设施。
- **任务交接（Handoffs，Agents SDK）。** 一个一等公民原语，用于让一个智能体显式地把对话转交给另一个智能体——是编排者—工作者交接（第 4 模块第 27 页）的一个更轻量、厂商原生的版本。
- **护栏（Guardrails，Agents SDK）。** 可配置的输入/输出校验钩子——为第 7 模块讲到的部分护栏模式提供了一个内置的落地场所。

与 LangGraph/CrewAI/AutoGen 相比，其代价在于：更换其他模型厂商或对控制流进行深度定制的灵活性较低，以换取更少的自建自运维基础设施。选择时一个合理的默认判断问题是：你是否已经确定只使用某一家厂商的模型、并希望尽量减少基础设施建设？还是你需要模型可移植性以及对编排的精细控制？前者更适合厂商托管工具，后者更适合开放框架。`,
    learningMapEn: `- Understand provider-managed (OpenAI Agents SDK/Assistants) vs. self-run frameworks
- Learn 4 managed pieces: threads/state, built-in tools, handoffs, guardrails
- Map each piece back to the module (memory, tool use, multi-agent, safety) it addresses
- Apply the "provider lock-in vs. infrastructure ownership" decision question`,
    learningMapZh: `- 理解厂商托管（OpenAI Agents SDK/Assistants）与自行运行框架的区别
- 掌握 4 个托管组成部分：线程/状态、内置工具、任务交接、护栏
- 把每个组成部分对应回其所解决的模块（记忆、工具使用、多智能体、安全）
- 运用"厂商锁定 vs. 基础设施自主权"这一决策问题`,
    handsOnEn: `1. Set up a managed thread and confirm conversation state persists server-side across calls.
2. Enable a built-in tool (code interpreter or file search) via configuration rather than building it yourself.
3. Implement a handoff from one agent to another using the SDK's native primitive.
4. Decide, for your own project, whether provider-managed tooling or an open framework fits better.`,
    handsOnZh: `1. 建立一个托管线程，确认对话状态在多次调用之间持续保存在服务端。
2. 通过配置（而非自行构建）启用一个内置工具（代码解释器或文件搜索）。
3. 使用 SDK 原生的原语实现一次从一个智能体到另一个智能体的任务交接。
4. 针对你自己的项目，判断厂商托管工具还是开放框架更适合。`,
    resources: [
      {
        title: "OpenAI — Function calling",
        url: "https://platform.openai.com/docs/guides/function-calling",
        description: "The underlying tool-calling mechanism that OpenAI's managed agent tooling builds on.",
      },
      {
        title: "OpenAI — Code Interpreter",
        url: "https://platform.openai.com/docs/assistants/tools/code-interpreter",
        description: "A managed built-in tool for sandboxed code execution within OpenAI's agent tooling.",
      },
    ],
  },
  {
    order: 42,
    key: "choosing-a-framework",
    titleEn: "Choosing an Agent Framework: A Decision Guide",
    titleZh: "如何选择智能体框架：决策指南",
    category: "best-practices",
    summaryEn:
      "No framework covered in this module is universally best — the right choice depends on your task's shape, not on which framework is most popular this quarter.",
    summaryZh: "本模块讲到的框架，没有一个是普遍最优的——正确的选择取决于你任务的形态，而不是这个季度哪个框架最流行。",
    tags: ["agentic-ai", "frameworks", "best-practices", "deeplearningai"],
    bodyEn: `Having covered LangGraph, CrewAI, AutoGen, and OpenAI's managed agent tooling, the practical question is which to reach for. A few decision axes that matter more than general popularity:

- **Control-flow shape.** Genuinely branching/looping logic with conditional routing → LangGraph's graph model fits directly. A small team of named specialists handing off sequentially → CrewAI's crew model fits directly. Iterative back-and-forth (especially code review/critique) → AutoGen's conversation model fits directly.
- **Provider commitment.** Committed to one model provider and want to minimize infrastructure → that provider's managed tooling (module page 41) is worth strongly considering. Need to swap models/providers or self-host → an open framework keeps that option open.
- **Team familiarity and existing stack.** A framework's "objectively better fit" on paper is worth less than a team's actual ability to build, debug, and maintain it — a slightly-less-ideal framework the team already knows often ships more reliably than a better-fit one nobody has used before.
- **Don't assume a framework where a simple loop suffices.** Every framework in this module adds real conceptual and operational overhead. For a genuinely simple task — one or two tool calls, no branching, no multi-agent coordination — a hand-written loop (module 0, page 3) is often the right choice, and adopting a framework "because that's what's used" is itself a design mistake worth avoiding.

The overarching principle across this whole guide: match the tool to the actual shape of the problem you have, re-evaluate as the task's complexity changes, and treat "we already use X" as one real input to the decision, not the only one.`,
    bodyZh: `在了解过 LangGraph、CrewAI、AutoGen 以及 OpenAI 的托管智能体工具之后，实际要面对的问题是该选用哪一个。以下几个决策维度，比"哪个框架这个季度最流行"更值得重视：

- **控制流的形态。** 具有真正的分支/循环逻辑、需要条件路由 → LangGraph 的图模型直接契合。由若干命名专家组成的小团队、按顺序交接工作 → CrewAI 的团队模型直接契合。迭代式的来回交互（尤其是代码评审/批评）→ AutoGen 的对话模型直接契合。
- **对厂商的依赖程度。** 已确定只使用某一家模型厂商、希望尽量减少基础设施 → 该厂商的托管工具（第 41 页）值得重点考虑。需要更换模型/厂商或自行托管 → 开放框架能保留这一选择空间。
- **团队的熟悉程度与现有技术栈。** 一个框架在纸面上"客观上更契合"，其价值远不如团队实际构建、调试和维护它的能力——一个团队已经熟悉的、稍微没那么理想的框架，往往比一个更契合、但没人用过的框架交付得更可靠。
- **不要在一个简单循环就足够的地方假设需要用框架。** 本模块提到的每一个框架，都会带来真实的概念和运维开销。对于一个真正简单的任务——一两次工具调用、没有分支、没有多智能体协调——手写的循环（第 0 模块第 3 页）往往才是正确的选择，仅仅因为"大家都在用它"而采用某个框架，本身就是一种值得避免的设计错误。

贯穿整份指南的总体原则是：让工具匹配你所面对问题的真实形态，随着任务复杂度的变化重新评估，并把"我们已经在用 X"当作决策的一个真实输入，而不是唯一的输入。`,
    learningMapEn: `- Learn 4 decision axes: control-flow shape, provider commitment, team familiarity, when to avoid a framework entirely
- Map each of the 4 frameworks covered to the control-flow shape it fits best
- Recognize "we already use X" as a real but non-exclusive decision input
- Apply the "does a simple loop suffice?" check before adopting any framework`,
    learningMapZh: `- 掌握 4 个决策维度：控制流形态、厂商依赖程度、团队熟悉度、何时应完全不用框架
- 把前面讲到的 4 个框架分别对应到它们最契合的控制流形态
- 认识到"我们已经在用 X"是一个真实但非排他的决策输入
- 在采用任何框架前，先运用"一个简单循环是否已经足够？"这一检验`,
    handsOnEn: `1. Describe your task's control-flow shape in one sentence (branching? sequential? conversational?).
2. Match it against the 4 frameworks covered and identify the best structural fit.
3. Weigh that fit against your team's existing familiarity and provider commitments.
4. Explicitly check whether a hand-written loop would actually suffice before committing to a framework.`,
    handsOnZh: `1. 用一句话描述你任务的控制流形态（分支式？顺序式？对话式？）。
2. 将其与前面讲到的 4 个框架进行匹配，找出结构上最契合的那个。
3. 把这一契合度与团队现有的熟悉程度、厂商依赖情况一并权衡。
4. 在决定采用某个框架之前，明确检查一个手写循环是否其实已经足够。`,
    resources: [
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Explicitly argues for starting simple and adding framework complexity only when justified.",
      },
      {
        title: "DeepLearning.AI course catalog — Agents",
        url: "https://www.deeplearning.ai/courses?courses_date_desc[refinementList][topic][0]=Agents",
        description: "Compare hands-on short courses across LangGraph, CrewAI, AutoGen, and more before committing.",
      },
    ],
  },
];
