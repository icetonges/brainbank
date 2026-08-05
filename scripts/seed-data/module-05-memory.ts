import type { SeedPage } from "./types";

// Module 5 — Memory Systems (5 pages, order 33-37). Cross-cutting
// infrastructure that supports all four of Andrew Ng's design patterns.
export const module05Memory: SeedPage[] = [
  {
    order: 33,
    key: "short-term-vs-long-term-memory",
    titleEn: "Short-Term vs. Long-Term Memory in Agents",
    titleZh: "智能体中的短期记忆与长期记忆",
    category: "knowledge",
    summaryEn:
      "Short-term memory is what fits in the current context window; long-term memory is everything the agent needs to recall across sessions that doesn't — and the two need very different engineering.",
    summaryZh: "短期记忆是当前上下文窗口能容纳的内容；长期记忆则是智能体需要跨会话记住、却无法塞进上下文窗口的一切——这两者需要截然不同的工程实现。",
    tags: ["agentic-ai", "memory", "foundations", "deeplearningai"],
    bodyEn: `"Memory" for an LLM agent is really two different engineering problems wearing one name:

**Short-term (working) memory** is whatever's in the current context window: the conversation so far, the current plan, recent tool results. It's automatically "remembered" simply because it's still in the prompt — the engineering challenge is that it's finite and expensive; long-running agents will eventually overflow it (covered in the memory-compression page later in this module).

**Long-term memory** is everything the agent needs to recall that *isn't* automatically in context: facts learned in a previous session, user preferences stated last week, outcomes of past tasks. This has to be deliberately engineered — stored somewhere outside the context window (a database, a vector store, a file) and deliberately retrieved back into context when relevant, since nothing persists in an LLM's weights between calls.

The design question that matters most: **for any given piece of information, does it need to survive past this session, and if so, how will it get back into context next time it's needed?** Getting this wrong in either direction causes real problems — treating everything as short-term means the agent "forgets" things a user reasonably expected it to remember; treating everything as long-term (retrieving broadly on every turn) burns latency and context budget on facts that were only ever relevant to the current conversation.`,
    bodyZh: `对 LLM 智能体而言，"记忆"这一个名词实际上包含了两个截然不同的工程问题：

**短期（工作）记忆**是当前上下文窗口中的一切：迄今为止的对话、当前的计划、最近的工具调用结果。它之所以被"记住"，仅仅是因为它还留在 prompt 里——工程上的挑战在于它是有限且昂贵的；长时间运行的智能体最终会让它溢出（本模块后面的"记忆压缩"一页会讲到）。

**长期记忆**是智能体需要回忆起来、但*并不*自动出现在上下文中的一切：上一次会话中了解到的事实、用户上周表达过的偏好、过往任务的执行结果。这必须经过刻意的工程设计——存储在上下文窗口之外的某处（数据库、向量库、文件），并在需要时被刻意检索回上下文中，因为 LLM 的权重在两次调用之间不会保留任何信息。

最重要的设计问题是：**对任何一条信息而言，它是否需要在本次会话结束后依然存在？如果需要，下次用到它时，它要如何被重新带回上下文？** 在这个问题上判断错误，无论偏向哪个方向都会带来实际问题——把一切都当作短期记忆，会导致智能体"忘记"用户合理预期它应该记住的内容；把一切都当作长期记忆（每一轮都广泛检索），则会为那些只与当前对话相关的事实白白消耗延迟和上下文预算。`,
    learningMapEn: `- Distinguish short-term (context window) from long-term (deliberately stored/retrieved) memory
- Understand why nothing persists in an LLM's weights between calls
- Apply the "does this need to survive past this session?" design question
- See the cost of getting the short/long-term split wrong in either direction`,
    learningMapZh: `- 区分短期记忆（上下文窗口）与长期记忆（刻意存储/检索）
- 理解为何 LLM 的权重在两次调用之间不会保留信息
- 运用"这条信息是否需要在本次会话之后依然存在？"这一设计问题
- 理解短期/长期划分出错时（无论偏向哪个方向）带来的代价`,
    handsOnEn: `1. List 5 pieces of information your agent currently handles and classify each as short-term or long-term.
2. For each long-term item, specify where it's stored and how it gets retrieved back into context.
3. Identify one thing your agent currently "forgets" that a user would reasonably expect it to remember.
4. Identify one thing your agent over-retrieves that was only ever relevant to the current turn.`,
    handsOnZh: `1. 列出你智能体当前处理的 5 条信息，将其分类为短期或长期。
2. 对每一条长期信息，明确它存储在哪里、以及如何被检索回上下文。
3. 找出你的智能体目前"遗忘"的、但用户合理预期它应记住的一条信息。
4. 找出一条被过度检索、实际上只与当前这一轮相关的信息。`,
    resources: [
      {
        title: "Building agents with long-term memory — DeepLearning.AI",
        url: "https://www.deeplearning.ai/short-courses/",
        description: "DeepLearning.AI's short-course catalog, including agent-memory-focused courses (LangGraph + LangMem).",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Discusses context-window management as a core constraint on agent design.",
      },
    ],
  },
  {
    order: 34,
    key: "vector-memory-semantic-retrieval",
    titleEn: "Vector Memory and Semantic Retrieval",
    titleZh: "向量记忆与语义检索",
    category: "skill",
    summaryEn:
      "Storing memories as embeddings lets an agent retrieve past information by meaning rather than exact keyword match — the same technique RAG uses, applied to an agent's own history.",
    summaryZh: "把记忆以向量嵌入的形式存储，能让智能体按语义而非精确关键词匹配来检索过往信息——这与 RAG 使用的技术相同，只是应用在了智能体自身的历史记录上。",
    tags: ["agentic-ai", "memory", "vector-search", "deeplearningai"],
    bodyEn: `The most common long-term memory implementation embeds each piece of information (a fact, a past conversation turn, a summarized session) into a vector, stores it in a vector database, and retrieves the most semantically similar entries when a new query needs context — the exact mechanism a RAG pipeline uses, just pointed at the agent's own accumulated history instead of a fixed document corpus.

Practical considerations specific to agent memory (vs. general RAG):

- **What gets embedded matters more than the embedding model.** A raw conversation transcript embeds poorly (too much noise); a distilled fact ("user prefers metric units") or a well-written summary embeds far more usefully. Most of the engineering effort belongs in deciding *what to write to memory*, not in the retrieval mechanics.
- **Recency and relevance both matter, not just similarity.** A memory from 3 minutes ago about the current task is often more useful than a highly-similar memory from 3 months ago about a different context — many implementations blend semantic similarity with a recency score rather than ranking on similarity alone.
- **Write-time filtering beats read-time filtering.** Deciding what's worth remembering *before* writing it to the vector store (not every message needs to become a memory) keeps the store from filling with noise that later crowds out genuinely useful retrievals.
- **Retrieval should be a tool call (module 2), not an automatic prepend.** Letting the agent decide *when* to query memory, with what query, generally outperforms always retrieving the top-k memories on every turn regardless of relevance.`,
    bodyZh: `最常见的长期记忆实现方式，是把每一条信息（一个事实、一次过往对话轮次、一次会话摘要）嵌入为向量，存入向量数据库，在新查询需要上下文时检索出语义最相似的条目——这与 RAG 流水线所使用的机制完全相同，只是把它指向了智能体自身积累的历史记录，而不是一个固定的文档语料库。

与通用 RAG 相比，智能体记忆场景下需要特别注意的几点：

- **嵌入什么内容，比选用哪个嵌入模型更重要。** 原始对话记录嵌入效果不佳（噪声太多）；一个精炼后的事实（"用户偏好使用公制单位"）或一段写得好的摘要，则要有用得多。大部分工程投入应放在决定*要向记忆中写入什么*，而不是检索机制本身。
- **时效性与相关性同样重要，而不只是相似度。** 一条来自 3 分钟前、与当前任务相关的记忆，往往比一条 3 个月前、语义高度相似但涉及不同情境的记忆更有用——许多实现会把语义相似度与时效性得分结合起来，而不是只按相似度排序。
- **写入时过滤优于读取时过滤。** 在写入向量库*之前*就判断这条信息是否值得记住（并非每条消息都需要变成一条记忆），能防止存储被噪声填满，进而挤占日后真正有用的检索结果。
- **检索应当是一次工具调用（第 2 模块），而不是自动前置拼接。** 让智能体自行决定*何时*查询记忆、用什么查询语句去查，通常比不论相关与否、每一轮都自动检索 top-k 条记忆的效果更好。`,
    learningMapEn: `- Understand vector memory as RAG applied to an agent's own history
- Learn 4 practical considerations: what to embed, recency vs. similarity, write-time filtering, retrieval as a tool call
- Recognize that memory-write quality matters more than retrieval-model choice
- Practice distilling raw conversation into memory-worthy facts`,
    learningMapZh: `- 理解向量记忆是 RAG 在智能体自身历史上的应用
- 掌握 4 个实践要点：嵌入什么、时效性 vs. 相似度、写入时过滤、检索作为工具调用
- 认识到记忆写入质量比检索模型选择更重要
- 练习把原始对话提炼为值得记住的事实`,
    handsOnEn: `1. Take a raw conversation transcript and distill it into 2-3 memory-worthy facts.
2. Embed and store those facts (not the raw transcript) in a vector store.
3. Add a recency score alongside similarity when ranking retrieved memories.
4. Turn memory retrieval into an explicit tool the agent calls, rather than an automatic prepend.`,
    handsOnZh: `1. 找一段原始对话记录，提炼出 2—3 条值得记住的事实。
2. 把这些事实（而非原始对话）嵌入并存入向量库。
3. 在对检索到的记忆排序时，加入时效性得分，与相似度一并考虑。
4. 把记忆检索变成一个由智能体显式调用的工具，而不是自动前置拼接。`,
    resources: [
      {
        title: "Building agents with long-term memory — DeepLearning.AI",
        url: "https://www.deeplearning.ai/short-courses/",
        description: "Covers LangGraph + LangMem patterns for structured, retrievable agent memory.",
      },
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "Includes memory-store abstractions with semantic search built in.",
      },
    ],
  },
  {
    order: 35,
    key: "episodic-memory-session-continuity",
    titleEn: "Episodic Memory and Session Continuity",
    titleZh: "情景记忆与会话连续性",
    category: "skill",
    summaryEn:
      "Episodic memory remembers whole task attempts — what was tried, what happened, what the outcome was — the specific kind of memory that lets an agent pick up where a previous session left off.",
    summaryZh: "情景记忆记住的是完整的任务尝试——曾经尝试过什么、发生了什么、结果如何——正是这种记忆，让智能体能够从上一次会话中断的地方继续接着做。",
    tags: ["agentic-ai", "memory", "episodic-memory", "deeplearningai"],
    bodyEn: `Distinct from semantic memory (isolated facts, page 34), **episodic memory** stores whole *episodes* — a record of a specific task attempt: what the goal was, what steps were taken, what tools were used, and what the outcome was. This is the memory type that makes "continue where we left off" and "don't repeat a mistake from last time" actually work.

Practical structure for an episodic memory entry: goal, timestamp, key steps taken (not the full trace — a compressed summary), outcome (success/failure/partial), and — critically — any Reflexion-style verbal reflection (module 1, page 9) on what to do differently next time. Retrieval, then, isn't just "find similar facts" but "find similar *past attempts*" — when a new task looks like one attempted before, surfacing that episode (especially its reflection) directly informs the current attempt.

Session continuity is the user-facing payoff: a user returning after a week to continue a multi-day research task shouldn't need to re-explain the goal or re-establish context the agent already gathered. Implementing this well requires deciding, at the *end* of each session (not mid-task), what episodic summary to write — similar to Reflexion's "attempt → reflection" step, but scoped to an entire session rather than a single failed attempt, and written specifically to be useful to a *future* session picking the task back up.`,
    bodyZh: `与语义记忆（孤立的事实，见第 34 页）不同，**情景记忆**存储的是完整的*情景*——某一次具体任务尝试的记录：目标是什么、采取了哪些步骤、用了哪些工具、结果如何。正是这种记忆类型，让"从上次中断的地方继续"和"不重复上次犯过的错误"真正得以实现。

一条情景记忆条目的实用结构包括：目标、时间戳、所采取的关键步骤（不是完整轨迹，而是压缩后的摘要）、结果（成功/失败/部分完成），以及——至关重要的——任何 Reflexion 式的、关于下次该怎么做的言语反思（见第 1 模块第 9 页）。这样一来，检索就不再只是"查找相似的事实"，而是"查找相似的*过往尝试*"——当一个新任务看起来与之前尝试过的某个任务相似时，把该情景（尤其是其中的反思内容）呈现出来，能直接为当前的尝试提供参考。

会话连续性正是面向用户的实际收益：一位一周后回来继续一项多天研究任务的用户，不应该需要重新解释目标，或重新建立智能体早已收集过的上下文。要把这一点做好，需要在每次会话*结束时*（而不是任务进行中）决定：应当写入怎样的情景摘要——这与 Reflexion 的"尝试 → 反思"步骤类似，但作用范围是整个会话，而不是单次失败的尝试，并且要专门为*未来*重新接手该任务的会话而撰写，使其真正有用。`,
    learningMapEn: `- Distinguish episodic memory (whole task attempts) from semantic memory (isolated facts)
- Learn the practical episodic-entry structure: goal, steps, outcome, reflection
- Understand retrieval as "find similar past attempts," not just "find similar facts"
- Design an end-of-session summary step for future session continuity`,
    learningMapZh: `- 区分情景记忆（完整任务尝试）与语义记忆（孤立事实）
- 掌握情景条目的实用结构：目标、步骤、结果、反思
- 理解检索应是"查找相似的过往尝试"，而非仅"查找相似的事实"
- 为未来会话的连续性设计一个会话结束时的摘要步骤`,
    handsOnEn: `1. Design an episodic memory entry schema: goal, timestamp, key steps, outcome, reflection.
2. At the end of a multi-step task, write one episodic entry summarizing what happened.
3. Simulate a new, similar task and retrieve that episode — check whether its reflection actually helps.
4. Define what "picking up where a session left off" requires your agent to load at session start.`,
    handsOnZh: `1. 设计一个情景记忆条目的 schema：目标、时间戳、关键步骤、结果、反思。
2. 在一个多步骤任务结束时，写一条总结所发生情况的情景记忆条目。
3. 模拟一个新的、相似的任务，检索该情景条目——检查其中的反思是否真的有帮助。
4. 明确"从上次会话中断处继续"这一需求，要求你的智能体在会话开始时加载哪些内容。`,
    resources: [
      {
        title: "Reflexion: Language Agents with Verbal Reinforcement Learning",
        url: "https://arxiv.org/abs/2303.11366",
        description: "The verbal-reflection mechanism that episodic memory entries commonly build on.",
      },
      {
        title: "Building agents with long-term memory — DeepLearning.AI",
        url: "https://www.deeplearning.ai/short-courses/",
        description: "Covers session-persistent agent memory patterns directly relevant to episodic recall.",
      },
    ],
  },
  {
    order: 36,
    key: "memory-compression-summarization",
    titleEn: "Memory Compression and Summarization Strategies",
    titleZh: "记忆压缩与摘要策略",
    category: "skill",
    summaryEn:
      "A context window is a hard limit, not a soft one — long-running agents need an explicit strategy for compressing older context before it's forced out or silently truncated.",
    summaryZh: "上下文窗口是一个硬性限制，而非软性限制——长时间运行的智能体需要明确的策略，在旧的上下文被强制挤出或悄悄截断之前就主动对其进行压缩。",
    tags: ["agentic-ai", "memory", "context-management", "deeplearningai"],
    bodyEn: `Every model has a finite context window, and a sufficiently long-running agent — many tool calls, a long conversation, a multi-day task — will eventually generate more history than fits. Without a deliberate strategy, this fails in one of two ways: an error when the context limit is hit, or (worse, because it's silent) important early context gets truncated without the agent or user realizing what was lost.

Common compression strategies, roughly in order of information loss:

- **Rolling summarization.** Periodically (every N turns, or when approaching a token threshold), replace the oldest chunk of raw history with an LLM-generated summary of it — keeps the gist, loses the verbatim detail.
- **Selective retention.** Keep some messages verbatim (the original goal, key decisions, unresolved questions) while summarizing or dropping routine tool-call chatter — requires tagging what's actually important as it happens, not just applying a uniform summarizer.
- **Move to long-term memory instead of discarding.** Rather than compressing-in-place, write the important parts out to the long-term store (module pages 34-35) and drop them from the active context entirely — retrievable later if actually needed, rather than kept "just in case" at the cost of every turn's token budget.
- **Hierarchical summaries.** Summarize summaries — a session gets a summary, a week of sessions gets a summary of summaries — so even very long-running agents keep a bounded "recent past" representation regardless of how much raw history has accumulated.

The failure mode to design against specifically: silent, uneven truncation where a framework or provider default drops old messages without your code choosing *what* gets dropped — always prefer an explicit compression strategy you control over relying on whatever a library does by default.`,
    bodyZh: `每个模型的上下文窗口都是有限的，而一个足够长时间运行的智能体——大量工具调用、冗长的对话、跨天的任务——最终会产生超出容量的历史记录。如果没有刻意设计的策略，这会以两种方式之一失败：要么在达到上下文上限时报错，要么（更糟，因为它是悄无声息的）重要的早期上下文被截断，而智能体或用户都没意识到丢失了什么。

常见的压缩策略，大致按信息损失程度排列：

- **滚动式摘要（Rolling summarization）。** 定期（每 N 轮，或接近某个 token 阈值时），把最旧的一段原始历史替换为一段由 LLM 生成的摘要——保留大意，损失逐字细节。
- **选择性保留（Selective retention）。** 保留部分消息的原文（最初的目标、关键决策、尚未解决的问题），同时对常规的工具调用对话进行摘要或丢弃——需要在事情发生时就标记出哪些内容真正重要，而不是套用一个统一的摘要器。
- **迁移到长期记忆，而非直接丢弃。** 与其原地压缩，不如把重要部分写入长期存储（第 34—35 页），并将其完全从活跃上下文中移除——需要时可以再检索回来，而不是为了"以防万一"，让每一轮都白白消耗 token 预算来保留它。
- **层级式摘要（Hierarchical summaries）。** 对摘要再做摘要——一次会话有一份摘要，一周的多次会话则有一份"摘要的摘要"——这样即便是运行时间很长的智能体，无论已积累了多少原始历史，也能始终保持一个有界的"近期回顾"表示。

需要特别防范的失败模式是：由框架或厂商默认行为悄无声息、参差不齐地截断消息，而不是由你的代码来选择*该丢弃什么*——应始终优先采用你自己掌控的显式压缩策略，而不是依赖某个库的默认行为。`,
    learningMapEn: `- Understand the context window as a hard limit requiring an explicit strategy
- Learn 4 compression strategies: rolling summarization, selective retention, move-to-long-term, hierarchical summaries
- Recognize silent uneven truncation as the failure mode to design against
- Practice choosing what's verbatim-worthy vs. summarizable in a real transcript`,
    learningMapZh: `- 理解上下文窗口是需要显式策略应对的硬性限制
- 掌握 4 种压缩策略：滚动式摘要、选择性保留、迁移到长期记忆、层级式摘要
- 认识到"悄无声息的不均匀截断"是需要特别防范的失败模式
- 练习在真实对话记录中判断哪些内容值得保留原文、哪些可以摘要`,
    handsOnEn: `1. Measure how many turns/tool calls your longest-running agent task typically generates.
2. Estimate at what point that history would exceed your model's context window.
3. Implement rolling summarization or selective retention for the oldest chunk of history.
4. Confirm your framework/library isn't silently truncating messages by a default you don't control.`,
    handsOnZh: `1. 测量你运行时间最长的智能体任务通常会产生多少轮次/工具调用。
2. 估算这些历史记录在什么时候会超出你模型的上下文窗口。
3. 为最旧的一段历史实现滚动式摘要或选择性保留。
4. 确认你的框架/库不会依据某个你无法掌控的默认行为悄悄截断消息。`,
    resources: [
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Discusses context-window management strategies for long-running agent tasks.",
      },
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "Includes built-in message-trimming and summarization utilities for long conversations.",
      },
    ],
  },
  {
    order: 37,
    key: "knowledge-graphs-as-memory",
    titleEn: "Knowledge Graphs as Agent Memory",
    titleZh: "把知识图谱当作智能体记忆",
    category: "knowledge",
    summaryEn:
      "Where vector memory retrieves by similarity, a knowledge graph retrieves by explicit relationships — better suited to memory that's fundamentally about how things connect, not just what they are.",
    summaryZh: "向量记忆按相似度检索，而知识图谱按显式关系检索——更适合那些本质上关乎「事物之间如何关联」、而不只是「事物是什么」的记忆。",
    tags: ["agentic-ai", "memory", "knowledge-graphs", "deeplearningai"],
    bodyEn: `Vector memory (page 34) answers "what's semantically similar to this query?" well, but struggles with questions that are fundamentally about *relationships* rather than similarity: "what companies has this person worked at, and who did they report to at each one?" is a graph traversal, not a similarity search — no single stored fact's embedding captures that multi-hop structure.

A knowledge graph represents memory as entities (people, companies, projects, documents) and typed relationships between them (works-at, reports-to, produced, mentions). This makes certain queries an agent needs dramatically more reliable:

- **Multi-hop relationship queries** — "who worked with X on the project that led to Y" — traverse explicit edges rather than hoping a vector search happens to surface a chunk containing the whole chain.
- **Provenance and auditability** — a graph edge can carry metadata (source, confidence, timestamp), making it possible to answer "how do we know this?" in a way a raw embedding can't.
- **Structural consistency checks** — a graph can enforce or flag contradictions (two "works-at" edges for the same person at the same time, if that's meant to be exclusive) that a vector store has no mechanism to catch.

In practice, most production agent-memory systems combine both: a vector store for "find things similar to this," a graph for "find things connected to this in a specific way," often with the graph nodes themselves carrying embeddings so the two can be queried together. Building or maintaining a graph is real, ongoing effort (entity resolution, relationship extraction, keeping it in sync) — reach for it when your agent's memory needs are genuinely relational, not as a default over simpler vector storage.`,
    bodyZh: `向量记忆（第 34 页）擅长回答"什么在语义上与这个查询相似"，但面对本质上关乎*关系*而非相似度的问题时会力不从心："这个人曾在哪些公司工作过、在每家公司分别向谁汇报"，这是一次图遍历，而不是相似度搜索——任何单条存储事实的嵌入，都无法捕捉这种多跳结构。

知识图谱把记忆表示为实体（人、公司、项目、文档）以及它们之间带类型的关系（任职于、汇报给、产出了、提及）。这让智能体需要的某些查询变得可靠得多：

- **多跳关系查询**——"谁与 X 共同参与了后来促成 Y 的那个项目"——沿显式的边进行遍历，而不是寄希望于向量搜索恰好检索到包含整条链路的某个片段。
- **来源追溯与可审计性**——图中的一条边可以携带元数据（来源、置信度、时间戳），使得回答"我们是怎么知道这个的？"成为可能，而原始嵌入做不到这一点。
- **结构一致性检查**——图谱可以强制执行或标记出矛盾之处（例如同一个人在同一时间存在两条"任职于"的边，如果这本应是互斥的），而向量库没有机制能捕捉到这一点。

在实践中，大多数生产环境中的智能体记忆系统会把两者结合起来：用向量库回答"查找与此相似的内容"，用图谱回答"查找以特定方式与此相关联的内容"，通常图谱节点本身也会携带嵌入，以便两者可以联合查询。构建或维护一个图谱是真实的、持续性的工作（实体消歧、关系抽取、保持同步）——只有当你的智能体记忆需求确实是关系性的时才应采用它，而不应把它当作优先于更简单的向量存储的默认选择。`,
    learningMapEn: `- Understand what vector similarity search structurally can't answer well
- Learn the entity/relationship graph model for memory
- See 3 concrete benefits: multi-hop queries, provenance, consistency checks
- Recognize when to combine graph + vector memory vs. defaulting to vector alone`,
    learningMapZh: `- 理解向量相似度检索在结构上难以回答的问题类型
- 掌握用于记忆的"实体/关系"图模型
- 了解 3 个具体好处：多跳查询、来源追溯、一致性检查
- 判断何时应将图谱与向量记忆结合，而非默认只用向量`,
    handsOnEn: `1. Identify a question your agent needs to answer that's fundamentally relational (multi-hop), not just "similar to."
2. Sketch the entities and relationship types a graph would need to answer it.
3. Compare: could a vector store answer the same question reliably? Why or why not?
4. Decide whether your memory needs justify the ongoing effort of maintaining a graph, or whether vector memory alone suffices.`,
    handsOnZh: `1. 找出你的智能体需要回答的、本质上是关系性（多跳）而非"相似性"的问题。
2. 勾勒出回答该问题所需的实体和关系类型。
3. 对比：向量库能否可靠地回答同一个问题？为什么可以或不可以？
4. 判断你的记忆需求是否值得为维护图谱付出持续的工作量，还是单用向量记忆已经足够。`,
    resources: [
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Notes on choosing memory representations that match the structure of what needs to be recalled.",
      },
      {
        title: "Building agents with long-term memory — DeepLearning.AI",
        url: "https://www.deeplearning.ai/short-courses/",
        description: "Course catalog covering structured, queryable agent memory patterns beyond flat vector stores.",
      },
    ],
  },
];
