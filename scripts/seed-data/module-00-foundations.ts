import type { SeedPage } from "./types";

// Module 0 — Foundations of Agentic AI (6 pages, order 1-6).
// Original explainer content organized to mirror the topic sequence of
// DeepLearning.AI's "Agentic AI" course (deeplearning.ai/courses/agentic-ai)
// and Andrew Ng's public "agentic design patterns" writing in The Batch —
// not transcribed from either, written independently for this knowledge base.
export const module00Foundations: SeedPage[] = [
  {
    order: 1,
    key: "what-makes-an-ai-system-agentic",
    titleEn: `What Makes an AI System "Agentic"?`,
    titleZh: "什么让一个 AI 系统称得上「智能体」（Agentic）？",
    category: "knowledge",
    summaryEn:
      "An agentic system is defined less by any single feature and more by a loop: it can decide what to do next, act on that decision, and use the result to decide again.",
    summaryZh: "智能体系统的关键不在某一项功能，而在于一个循环：它能决定下一步做什么、执行该决定，并用结果再次决策。",
    tags: ["agentic-ai", "foundations", "ai-agents", "deeplearningai"],
    bodyEn: `A single LLM call that reads a prompt and returns text is not, by itself, an agent — it's a function. What turns an LLM-based system into an **agent** is giving it a loop: the ability to take an action, observe what happened, and decide the *next* action based on that observation, without a human filling in every step.

Most working definitions (including the one implicit in DeepLearning.AI's Agentic AI course) converge on a few properties:

- **Goal-directed, not just turn-directed.** The system is working toward an outcome, not just answering one message.
- **Multi-step.** It can take more than one action before returning to the user.
- **Environment-aware.** It observes the result of its own actions (a tool call, a file write, a search result) and conditions its next move on that result.
- **Some degree of autonomy.** It decides *what* to do next, even if a human approves risky steps.

"Agentic" is a spectrum, not a boolean. A form-filling assistant that follows five fixed steps is barely agentic; a system that plans its own multi-day research strategy, revises the plan when it hits dead ends, and calls a dozen different tools along the way sits much further along that spectrum. The rest of this section builds up the vocabulary — the agent loop, autonomy levels, and Andrew Ng's four design patterns — to talk about that spectrum precisely instead of just calling everything "an agent."`,
    bodyZh: `一次单纯读取 prompt 并返回文本的 LLM 调用，本身并不是"智能体"——它只是一个函数。真正让一个基于 LLM 的系统成为**智能体（agent）**的，是给它一个循环：能够执行一个动作、观察发生了什么，并基于这个观察决定*下一步*动作，而不需要人类填补每一个步骤。

大多数通用定义（包括 DeepLearning.AI「Agentic AI」课程中隐含的定义）都收敛到几个共同特征：

- **面向目标，而非仅面向单轮对话。** 系统朝着一个结果努力，而不只是回答一条消息。
- **多步骤。** 在返回给用户之前，它可以执行不止一个动作。
- **感知环境。** 它会观察自己动作的结果（一次工具调用、一次文件写入、一次搜索结果），并据此决定下一步。
- **具备一定自主性。** 它自己决定"下一步做什么"，即便高风险步骤仍需人类批准。

"Agentic（智能体化）"是一个连续谱系，而不是非黑即白的判断。一个按五个固定步骤填表的助手几乎算不上智能体；而一个能自行规划多天的研究策略、在遇到死胡同时修改计划、并沿途调用十几种不同工具的系统，则远远处于这个谱系的更前端。本节接下来会建立起精确讨论这个谱系所需的词汇——智能体循环、自主性层级，以及 Andrew Ng 提出的四种设计模式——而不是笼统地把一切都称为"智能体"。`,
    learningMapEn: `- Start with the definition: goal-directed, multi-step, environment-aware, autonomous
- Contrast one LLM call vs. a loop of calls
- See where RAG and simple prompt chains fall short of "agentic"
- Preview the four design patterns covered later: Reflection, Tool Use, Planning, Multi-Agent`,
    learningMapZh: `- 从定义出发：面向目标、多步骤、感知环境、具备自主性
- 对比"单次 LLM 调用"与"循环调用"
- 理解 RAG 与简单 prompt 链在多大程度上还算不上"agentic"
- 预览后续会讲到的四种设计模式：反思、工具使用、规划、多智能体`,
    handsOnEn: `1. Take a chatbot you've built or used and list which of the four properties (goal-directed, multi-step, environment-aware, autonomous) it actually has.
2. Sketch, on paper, the loop your system would need to add the missing properties.
3. Identify one task in your own work that currently requires you to manually chain 3+ LLM calls together — that's a strong candidate for your first agent.
4. Write a one-paragraph "definition of done" for that task, so you'll be able to tell later whether an agent actually solved it.`,
    handsOnZh: `1. 选一个你用过或做过的聊天机器人，列出它在四个特征（面向目标、多步骤、感知环境、自主性）中实际具备哪些。
2. 在纸上画出：要补齐缺失的特征，你的系统需要增加怎样的循环。
3. 在你自己的工作中找一个目前需要你手动串联 3 次以上 LLM 调用的任务——这是你第一个智能体的有力候选。
4. 为该任务写一段"完成的定义"，以便日后判断智能体是否真正解决了它。`,
    resources: [
      {
        title: "Agentic AI — DeepLearning.AI",
        url: "https://www.deeplearning.ai/courses/agentic-ai",
        description: "Andrew Ng's course page — the four-pattern framing this knowledge base is organized around.",
      },
      {
        title: "What Are Agentic Design Patterns?",
        url: "https://www.augmentcode.com/guides/agentic-design-patterns",
        description: "A field overview of the pattern catalog referenced throughout this section.",
      },
    ],
  },
  {
    order: 2,
    key: "chatbots-to-agents",
    titleEn: "From Chatbots to Agents: The Shift in LLM Application Design",
    titleZh: "从聊天机器人到智能体：LLM 应用设计的转变",
    category: "knowledge",
    summaryEn:
      "Chatbot design optimizes a single response; agent design optimizes a trajectory of actions toward a goal — a different engineering problem with different failure modes.",
    summaryZh: "聊天机器人设计优化的是单次回复；智能体设计优化的是朝向目标的一整条动作轨迹——这是一个具有不同失败模式的、不同的工程问题。",
    tags: ["agentic-ai", "foundations", "product-design", "deeplearningai"],
    bodyEn: `Early LLM products were fundamentally single-turn: user asks, model answers, done. Even multi-turn chat is still, from the model's point of view, a series of independent single-turn calls with a growing transcript attached. The quality bar for that kind of system is "was this one reply good?"

Agentic systems change the unit of design from *reply* to *trajectory*: the sequence of actions the system takes across an entire task. That shift has real consequences:

- **Errors compound.** A chatbot's bad answer is one bad answer. An agent's bad step at step 3 of 12 can derail everything downstream.
- **Latency and cost accumulate.** Ten tool calls at 2 seconds each is a 20-second task, not a 2-second reply.
- **"Good" becomes outcome-based, not turn-based.** You stop asking "was that a good message?" and start asking "did the task get done correctly, safely, and efficiently?"
- **The interface changes.** Agents often need to show their work — what they tried, what tools they called, what they're planning next — because a black-box multi-minute process is much harder to trust than a visible one.

This is why agent frameworks (covered later in this course) look different from chat SDKs: they're built around state, steps, and control flow, not just prompt-and-response.`,
    bodyZh: `早期的 LLM 产品本质上是单轮的：用户提问，模型回答，结束。即便是多轮对话，从模型的角度看，也仍然只是一系列独立的单轮调用，只是附带了一份不断增长的对话记录。这类系统的质量标准是"这一次回复好不好"。

智能体系统把设计的基本单位从"回复"变成了"轨迹"——即系统在完成整个任务过程中所采取的一连串动作。这一转变带来了实实在在的后果：

- **错误会累积放大。** 聊天机器人答错一次就是一次错误；智能体在 12 步中的第 3 步出错，可能会让后续所有步骤都偏离方向。
- **延迟和成本会叠加。** 十次工具调用、每次 2 秒，加起来就是一个 20 秒的任务，而不是一次 2 秒的回复。
- **"好"变成了基于结果的评价，而非基于单轮对话。** 不再问"这条消息好不好"，而要问"任务是否被正确、安全、高效地完成了"。
- **界面也要随之改变。** 智能体往往需要展示它的"工作过程"——尝试过什么、调用了哪些工具、接下来打算做什么——因为一个持续数分钟、结果不透明的黑箱过程，远比一个可见的过程更难获得信任。

这也是为什么智能体框架（本课程后续会讲到）与聊天类 SDK 看起来不同：它们是围绕状态、步骤和控制流构建的，而不仅仅是"prompt 输入、回复输出"。`,
    learningMapEn: `- Compare the unit of optimization: reply vs. trajectory
- Understand why errors compound across steps
- See why latency/cost budgets matter more for agents than chatbots
- Connect "show your work" UI patterns to trust in long-running agents`,
    learningMapZh: `- 对比优化单位：回复 vs. 轨迹
- 理解错误为何会在多步骤间累积
- 认识到延迟/成本预算对智能体比对聊天机器人更重要
- 将"展示工作过程"的 UI 模式与长任务信任问题联系起来`,
    handsOnEn: `1. Pick an existing chatbot feature and count how many separate LLM calls it would need if turned into a 3-step agent.
2. Estimate the worst-case latency and cost of that 3-step chain.
3. Design a minimal "trace view" (even just a console log) that shows each step's action and result.
4. Decide, for one risky step, whether it needs a human-approval gate before executing.`,
    handsOnZh: `1. 选一个现有的聊天机器人功能，估算如果把它改造成 3 步的智能体，需要多少次独立的 LLM 调用。
2. 估算这条 3 步链路在最坏情况下的延迟和成本。
3. 设计一个最简"过程追踪视图"（哪怕只是控制台日志），展示每一步的动作与结果。
4. 针对其中一个高风险步骤，决定它在执行前是否需要人工审批环节。`,
    resources: [
      {
        title: "AI Agents in LangGraph — DeepLearning.AI",
        url: "https://www.deeplearning.ai/courses/ai-agents-in-langgraph",
        description: "Building an agent from scratch, then rebuilding it as a graph of steps rather than a single call.",
      },
      {
        title: "DeepLearning.AI course catalog — Agents",
        url: "https://www.deeplearning.ai/courses?courses_date_desc[refinementList][topic][0]=Agents",
        description: "Full list of DeepLearning.AI's agent-focused short courses, for going deeper on any pattern.",
      },
    ],
  },
  {
    order: 3,
    key: "the-agent-loop",
    titleEn: "The Agent Loop: Perceive, Plan, Act, Reflect",
    titleZh: "智能体循环：感知、规划、行动、反思",
    category: "knowledge",
    summaryEn:
      "Nearly every agent architecture, however framework-specific its terminology, reduces to the same four-stage loop repeating until a stop condition is met.",
    summaryZh: "几乎所有智能体架构，无论其框架特有的术语如何，最终都可以归结为同一个四阶段循环，不断重复直到满足停止条件。",
    tags: ["agentic-ai", "foundations", "agent-loop", "deeplearningai"],
    bodyEn: `Strip away any framework's specific vocabulary and almost every agent runs the same loop:

1. **Perceive** — read the current state: the user's goal, the conversation so far, the result of the last action.
2. **Plan** — decide what to do next, given that state. This can be as simple as "call the next tool in a fixed sequence" or as complex as generating and comparing several candidate next steps.
3. **Act** — execute the chosen action: call a tool, run code, ask the user a clarifying question, or produce a final answer.
4. **Reflect / Update state** — incorporate the result of the action back into the system's understanding, then loop back to Perceive.

The loop terminates on some **stop condition**: the goal is achieved, a maximum step count is hit, the agent explicitly decides it's done, or a human intervenes. That last part matters — an agent loop without a stop condition is a liability, not a feature; unattended loops are the single most common source of runaway cost and unsafe behavior in early agent deployments.

Every pattern covered later in this course is really a variation on how one stage of this loop is implemented: Reflection elaborates the "Reflect" stage into its own sub-loop; Planning elaborates "Plan"; Tool Use elaborates "Act"; Multi-Agent splits the whole loop across more than one LLM.`,
    bodyZh: `剥离掉各个框架特有的术语，几乎所有智能体运行的都是同一个循环：

1. **感知（Perceive）**——读取当前状态：用户的目标、到目前为止的对话、上一次动作的结果。
2. **规划（Plan）**——基于该状态决定下一步做什么。这可以简单到"按固定顺序调用下一个工具"，也可以复杂到生成并比较多个候选的下一步方案。
3. **行动（Act）**——执行所选动作：调用工具、运行代码、向用户提出澄清问题，或给出最终答案。
4. **反思 / 更新状态（Reflect）**——把动作的结果重新纳入系统对当前情况的理解，然后回到"感知"阶段。

该循环会在满足某个**停止条件**时终止：目标已达成、达到最大步数上限、智能体自行判断已完成，或有人类介入。最后这一点很关键——没有停止条件的智能体循环不是一个特性，而是一种风险；在早期的智能体部署中，无人值守的循环是失控成本和不安全行为最常见的单一来源。

本课程后续讲到的每一种模式，本质上都是对这个循环中某一阶段的具体实现方式的变化：反思（Reflection）把"反思"阶段展开成一个独立的子循环；规划（Planning）细化了"规划"阶段；工具使用（Tool Use）细化了"行动"阶段；多智能体（Multi-Agent）则把整个循环拆分给不止一个 LLM。`,
    learningMapEn: `- Memorize the four stages: Perceive, Plan, Act, Reflect
- Identify what "stop condition" your agent needs before you build it
- Map each later pattern (Reflection/Planning/Tool Use/Multi-Agent) to the loop stage it elaborates
- Recognize runaway-loop risk as a design problem, not an edge case`,
    learningMapZh: `- 记住四个阶段：感知、规划、行动、反思
- 在动手构建前，先明确你的智能体需要怎样的"停止条件"
- 把后续每种模式（反思/规划/工具使用/多智能体）对应到它所细化的循环阶段
- 认识到"失控循环"是一个设计问题，而非边缘情况`,
    handsOnEn: `1. Draw the four-stage loop for a task you know well (e.g. "book a flight").
2. Write down, in one sentence each, what Perceive/Plan/Act/Reflect concretely mean for that task.
3. Specify at least two stop conditions: a success condition and a max-steps safety condition.
4. Identify which stage is riskiest to leave fully autonomous, and note where a human checkpoint belongs.`,
    handsOnZh: `1. 为一个你熟悉的任务（例如"订一张机票"）画出四阶段循环。
2. 用一句话分别写出该任务中"感知/规划/行动/反思"具体指什么。
3. 至少设定两个停止条件：一个成功条件，一个最大步数的安全条件。
4. 判断哪个阶段完全自主执行的风险最高，并标出应设置人工检查点的位置。`,
    resources: [
      {
        title: "ReAct: Synergizing Reasoning and Acting in Language Models",
        url: "https://arxiv.org/abs/2210.03629",
        description: "The paper that popularized interleaving reasoning traces with actions — the loop made concrete.",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Engineering guidance on when a simple loop beats a complex framework.",
      },
    ],
  },
  {
    order: 4,
    key: "core-components",
    titleEn: "Core Components of an AI Agent (LLM, Memory, Tools, Orchestrator)",
    titleZh: "AI 智能体的核心组件（LLM、记忆、工具、编排器）",
    category: "knowledge",
    summaryEn:
      "Almost every agent architecture assembles the same four building blocks: a reasoning engine, a memory store, a set of tools, and an orchestrator that runs the loop.",
    summaryZh: "几乎所有智能体架构都是由同样四个构件组装而成：一个推理引擎、一个记忆存储、一组工具，以及一个负责驱动循环的编排器。",
    tags: ["agentic-ai", "foundations", "architecture", "deeplearningai"],
    bodyEn: `Before naming any framework, it helps to name the parts every agent architecture is made of:

- **Reasoning engine (the LLM).** Decides what to do next given the current state. Swappable in principle — many production agents are designed so the underlying model can be upgraded without rewriting the agent logic.
- **Memory.** What the agent knows beyond the current prompt: short-term (the running conversation/scratchpad) and long-term (facts, past sessions, retrieved documents) — covered in depth later in this course.
- **Tools.** The agent's hands: APIs, code execution, search, databases, other agents. An agent's ceiling is largely set by what tools it has and how well they're described.
- **Orchestrator.** The code that actually runs the loop — calls the LLM, parses its decision, invokes the chosen tool, feeds the result back in, and enforces stop conditions and guardrails. This is the part frameworks like LangGraph, CrewAI, and AutoGen mostly provide.

A useful mental model: the LLM is the *judgment*, tools are the *capability*, memory is the *context*, and the orchestrator is the *nervous system* connecting all three. Weakness in any one component caps the whole system — a brilliant model with no tools can't act, and great tools with a weak orchestrator produce unreliable execution.`,
    bodyZh: `在谈论任何具体框架之前，先弄清楚每一种智能体架构都由哪些部件构成会更有帮助：

- **推理引擎（LLM）。** 基于当前状态决定下一步该做什么。原则上是可替换的——许多生产环境中的智能体在设计时就考虑到底层模型可以升级，而无需重写智能体逻辑。
- **记忆（Memory）。** 智能体在当前 prompt 之外所"知道"的内容：短期记忆（正在进行的对话/暂存区）与长期记忆（事实、历史会话、检索到的文档）——本课程后续会深入讨论。
- **工具（Tools）。** 智能体的"手"：API、代码执行、搜索、数据库、其他智能体。一个智能体能力的上限，很大程度上取决于它拥有哪些工具、以及这些工具的描述质量。
- **编排器（Orchestrator）。** 真正驱动循环运转的代码——调用 LLM、解析其决策、调用所选工具、把结果反馈回去，并执行停止条件和护栏规则。LangGraph、CrewAI、AutoGen 等框架，主要提供的就是这一部分。

一个有用的心智模型是：LLM 是"判断力"，工具是"能力"，记忆是"上下文"，编排器则是把三者连接起来的"神经系统"。任何一个组件薄弱，都会限制整个系统的上限——再聪明的模型没有工具也无法行动；再好的工具配上薄弱的编排器，执行也会不可靠。`,
    learningMapEn: `- Name the four building blocks: reasoning engine, memory, tools, orchestrator
- Understand the "judgment / capability / context / nervous system" mental model
- Recognize that frameworks mostly implement the orchestrator, not the judgment
- Preview: memory and tools each get dedicated modules later in this course`,
    learningMapZh: `- 记住四个构件：推理引擎、记忆、工具、编排器
- 理解"判断力 / 能力 / 上下文 / 神经系统"这一心智模型
- 认识到框架主要实现的是编排器，而非判断力本身
- 预告：记忆与工具在本课程后续都有专门模块`,
    handsOnEn: `1. For an agent idea of yours, list which LLM, which tools, and what memory it needs.
2. Identify the weakest of the four components in your current design.
3. Sketch the orchestrator's job in pseudocode: the loop that calls the LLM and dispatches to tools.
4. Note one guardrail the orchestrator must enforce (e.g. max tool calls, forbidden actions).`,
    handsOnZh: `1. 针对你的一个智能体构想，列出它需要哪个 LLM、哪些工具、以及怎样的记忆。
2. 找出当前设计中四个组件里最薄弱的一个。
3. 用伪代码勾勒编排器的职责：调用 LLM 并分发到工具的循环。
4. 记下编排器必须强制执行的一条护栏规则（例如最大工具调用次数、禁止的动作）。`,
    resources: [
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "A concrete example of an orchestrator implementation — state, nodes, edges.",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Discusses when to compose these components yourself vs. reach for a framework.",
      },
    ],
  },
  {
    order: 5,
    key: "agentic-vs-rag-vs-chaining",
    titleEn: "Agentic AI vs. RAG vs. Prompt Chaining",
    titleZh: "智能体 AI vs. RAG vs. Prompt 链",
    category: "knowledge",
    summaryEn:
      "RAG and prompt chaining are fixed pipelines the developer designed in advance; an agentic system decides its own pipeline at run time.",
    summaryZh: "RAG 和 prompt 链是开发者预先设计好的固定流程；而智能体系统是在运行时自行决定其流程。",
    tags: ["agentic-ai", "foundations", "rag", "deeplearningai"],
    bodyEn: `These three terms get conflated often enough that it's worth drawing the lines explicitly:

- **Prompt chaining** — a fixed sequence of LLM calls, each step hard-coded by the developer (step 1's output feeds step 2's input, etc.). No branching decided by the model; the *developer* decided the control flow.
- **RAG (Retrieval-Augmented Generation)** — a specific, usually single-hop pipeline: retrieve relevant documents, stuff them into context, generate an answer. It's a technique for grounding, not a general architecture for taking action.
- **Agentic AI** — the control flow itself is decided at run time, by the model (or by a planner it invokes). An agent *can* use RAG as one of its tools, and *can* include prompt-chain-like fixed sub-steps, but the defining trait is that *which* steps run, and in *what order*, is not fully fixed in advance.

A simple test: if you can draw the entire flowchart before running the system and it never deviates, it's a chain (possibly RAG-augmented). If the flowchart has a node labeled "model decides," you're in agentic territory. Most production systems in 2025-2026 are hybrids: agentic control flow around deterministic RAG and tool sub-pipelines — treat "agentic" as an additive capability layered onto reliable pipelines, not a replacement for them.`,
    bodyZh: `这三个术语经常被混用，值得明确划清界限：

- **Prompt 链（Prompt chaining）**——一系列固定顺序的 LLM 调用，每一步都由开发者硬编码（第 1 步的输出作为第 2 步的输入，依此类推）。没有由模型决定的分支；控制流是*开发者*决定的。
- **RAG（检索增强生成）**——一种特定的、通常是单跳的流程：检索相关文档、将其塞入上下文、生成答案。它是一种"落地/grounding"技术，而不是一种通用的、用于采取行动的架构。
- **智能体 AI（Agentic AI）**——控制流本身是在运行时由模型（或它调用的规划器）决定的。智能体*可以*把 RAG 当作它的工具之一使用，也*可以*包含类似 prompt 链的固定子步骤，但其定义性特征是：*哪些*步骤会执行、以及以*何种顺序*执行，事先并未完全固定。

一个简单的判定方法是：如果你能在运行系统之前把整个流程图画出来，并且它从不偏离，那它就是一条链（可能是 RAG 增强的）。如果流程图中有一个节点标注着"由模型决定"，那你就进入了智能体的范畴。2025—2026 年间大多数生产系统其实是混合体：在确定性的 RAG 和工具子流程之外，包裹着一层智能体式的控制流——把"agentic"看作叠加在可靠流程之上的一层附加能力，而不是对它们的替代。`,
    learningMapEn: `- Define prompt chaining, RAG, and agentic AI precisely and separately
- Apply the "can you draw the whole flowchart in advance?" test
- See agentic AI as additive to RAG/chains, not a replacement
- Preview: retrieval reappears later as "one tool among many" for agents`,
    learningMapZh: `- 精确且分别地定义 prompt 链、RAG、智能体 AI
- 运用"能否事先画出完整流程图"这一判定方法
- 理解智能体 AI 是对 RAG/链的叠加，而非替代
- 预告：检索会在后续章节中作为"众多工具之一"重新出现`,
    handsOnEn: `1. Take a system you've built and classify it: prompt chain, RAG, or agentic.
2. Draw its flowchart. If you can draw it fully in advance, it's not agentic yet.
3. Identify one decision point in that flowchart you could hand to the model instead of hard-coding.
4. Estimate the reliability trade-off: what do you gain in flexibility, and what do you risk in predictability?`,
    handsOnZh: `1. 选一个你构建过的系统，判断它属于 prompt 链、RAG，还是智能体。
2. 画出它的流程图。如果你能完整地预先画出来，那它还算不上智能体。
3. 在该流程图中找一个决策点，考虑是否可以交给模型来决定，而不是硬编码。
4. 评估这一权衡：在灵活性上能获得什么，在可预测性上又要承担怎样的风险。`,
    resources: [
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Explicitly distinguishes workflows (fixed chains) from agents (model-decided control flow).",
      },
      {
        title: "Agentic AI — DeepLearning.AI",
        url: "https://www.deeplearning.ai/courses/agentic-ai",
        description: "Positions agentic workflows as the next step past retrieval-augmented, single-shot generation.",
      },
    ],
  },
  {
    order: 6,
    key: "four-design-patterns-map",
    titleEn: "Andrew Ng's Four Agentic Design Patterns: A Map of the Field",
    titleZh: "Andrew Ng 的四种智能体设计模式：全景地图",
    category: "knowledge",
    summaryEn:
      "Reflection, Tool Use, Planning, and Multi-Agent Collaboration are the four design patterns this entire section is organized around — a map you can return to at any point.",
    summaryZh: "反思、工具使用、规划、多智能体协作，是本节内容据以组织的四种设计模式——你可以在任何时候回到这张地图来定位自己所在的位置。",
    tags: ["agentic-ai", "foundations", "design-patterns", "deeplearningai"],
    bodyEn: `In March 2024, Andrew Ng published a widely-cited framing of agentic workflows around four design patterns, later formalized as the backbone of DeepLearning.AI's "Agentic AI" course. Everything in the modules that follow is an elaboration of one of these four:

1. **Reflection** — the agent examines its own output, critiques it, and produces a revised version. Cheap to implement, and often the single highest-leverage pattern to add first.
2. **Tool Use** — the agent calls external functions/APIs to do what the model alone cannot: fetch current data, run code, query a database, search the web.
3. **Planning** — the agent breaks a complex goal into a sequence of steps *before* (or while) executing them, rather than trying to solve everything in one generation.
4. **Multi-Agent Collaboration** — multiple LLM instances, each with a distinct role or specialization, work together, critique each other, or hand off subtasks — division of labor applied to reasoning itself.

Ng's own framing (see the resources below) is that these are not mutually exclusive — the most capable systems combine several, e.g. a planner that decomposes a task, hands sub-tasks to specialized agents, each of which uses tools and reflects on its own output before reporting back. Modules 1 through 4 of this course take each pattern in turn; use this page as the index to come back to.`,
    bodyZh: `2024 年 3 月，Andrew Ng 发表了一篇被广泛引用的文章，围绕四种设计模式构建了对智能体工作流的框架化理解，后来这一框架被正式确立为 DeepLearning.AI「Agentic AI」课程的骨架。接下来各模块的所有内容，都是对这四种模式之一的展开：

1. **反思（Reflection）**——智能体审视自己的输出、进行批评，并生成修订版本。实现成本低，往往是最先加入、性价比最高的一种模式。
2. **工具使用（Tool Use）**——智能体调用外部函数/API 来完成模型本身无法完成的事：获取实时数据、运行代码、查询数据库、搜索网络。
3. **规划（Planning）**——智能体在执行之前（或执行过程中）先把一个复杂目标拆解为一系列步骤，而不是试图在一次生成中解决所有问题。
4. **多智能体协作（Multi-Agent Collaboration）**——多个 LLM 实例，各自扮演不同的角色或专长，协同工作、互相批评，或分工处理子任务——将"分工"这一原则应用到推理本身。

Ng 本人的表述（见下方资源）是：这些模式并非互斥——最强大的系统往往会组合使用多种模式，例如：一个规划者将任务拆解，把子任务分派给各自专长不同的智能体，每个智能体在汇报结果前都会使用工具并对自己的输出进行反思。本课程的模块 1 到模块 4 将依次深入讲解每一种模式；你可以把这一页当作索引，随时回来定位。`,
    learningMapEn: `- Memorize the four patterns: Reflection, Tool Use, Planning, Multi-Agent Collaboration
- Understand these are composable, not mutually exclusive
- Use this page as a map back to modules 1-4
- Note which pattern your current project idea is missing`,
    learningMapZh: `- 记住四种模式：反思、工具使用、规划、多智能体协作
- 理解它们是可组合的，而非互斥的
- 把本页当作回到模块 1—4 的地图
- 找出你当前项目构想中缺失的是哪一种模式`,
    handsOnEn: `1. For a project idea, identify which of the four patterns it already uses.
2. Pick the pattern most obviously missing and write one sentence on how it would help.
3. Rank the four patterns by expected implementation effort for your project (cheapest first).
4. Decide which pattern to prototype first, based on effort vs. expected quality gain.`,
    handsOnZh: `1. 针对一个项目构想，判断它已经用到了四种模式中的哪些。
2. 找出最明显缺失的一种模式，用一句话写出它能带来什么帮助。
3. 按你项目中的预期实现成本，从低到高给四种模式排序。
4. 基于"成本 vs. 预期质量提升"，决定先原型化哪一种模式。`,
    resources: [
      {
        title: "Andrew Ng — Four design patterns for AI agentic workflows",
        url: "https://x.com/AndrewYNg/status/1773393357022298617",
        description: "The original public framing of Reflection, Tool Use, Planning, and Multi-agent collaboration.",
      },
      {
        title: "Agentic AI — DeepLearning.AI",
        url: "https://www.deeplearning.ai/courses/agentic-ai",
        description: "The course that formalizes these four patterns into a hands-on curriculum.",
      },
    ],
  },
];
