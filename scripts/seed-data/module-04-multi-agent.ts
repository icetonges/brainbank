import type { SeedPage } from "./types";

// Module 4 — Multi-Agent Collaboration (7 pages, order 26-32). Fourth of
// Andrew Ng's four agentic design patterns.
export const module04MultiAgent: SeedPage[] = [
  {
    order: 26,
    key: "why-multi-agent",
    titleEn: "Why Multi-Agent? Division of Labor in Agentic Systems",
    titleZh: "为何要多智能体？智能体系统中的分工",
    category: "knowledge",
    summaryEn:
      "A single agent juggling every role in a task tends to do each role worse than a team of narrower agents that specialize — the same reason human organizations divide labor.",
    summaryZh: "一个在单一任务中身兼数职的智能体，往往每个角色都做得不如一支各有专长的窄域智能体团队——这与人类组织进行分工的原因如出一辙。",
    tags: ["agentic-ai", "multi-agent", "design-patterns", "deeplearningai"],
    bodyEn: `A single agent handling an entire complex task holds every role's context, instructions, and tool set in one prompt — a researcher's instructions mixed with a writer's style guide mixed with a critic's rubric, all competing for the same attention budget. As task complexity grows, that mixing degrades every role's performance simultaneously.

Multi-agent collaboration — the fourth of Andrew Ng's design patterns — addresses this by giving each role its own agent: a focused system prompt, a scoped tool set, and (often) a different underlying model chosen for that specific job. A research agent optimized for thorough tool use, a writing agent optimized for prose quality, and a critic agent optimized for finding flaws can each be prompt-engineered and evaluated independently, then composed.

This isn't free — coordination overhead (getting agents to hand off work cleanly, covered later in this module) and cost (more LLM calls) are real costs of splitting one agent into several. The decision test that matters: does this task have genuinely distinct sub-roles with different skills/context, or is it one coherent task being artificially split? Multi-agent helps the former and just adds overhead to the latter — module pages 27-32 cover the concrete patterns (orchestrator-worker, debate, hierarchy, communication, shared state, and failure modes) for building it well when it does help.`,
    bodyZh: `一个独自处理整个复杂任务的智能体，需要在同一个 prompt 中同时持有每个角色的上下文、指令和工具集——研究者的指令、写作者的风格指南、评审者的评分标准全都混在一起，争夺同一份注意力预算。随着任务复杂度上升，这种混合会同时拉低每个角色的表现。

多智能体协作——Andrew Ng 四种设计模式中的第四种——通过为每个角色配备专属的智能体来解决这一问题：一个聚焦的系统 prompt、一个范围明确的工具集，（往往）还有针对该具体工作专门挑选的底层模型。一个针对充分利用工具而优化的研究型智能体、一个针对文笔质量优化的写作型智能体，以及一个针对发现缺陷而优化的评审型智能体，可以分别独立地进行 prompt 工程和评估，再组合起来使用。

这并非没有代价——协调开销（让各智能体顺利完成工作交接，本模块后面会讲到）和成本（更多的 LLM 调用）都是把一个智能体拆分为多个所付出的真实代价。真正重要的判断标准是：这个任务是否确实存在技能/上下文各不相同的独立子角色，还是一个本来连贯的任务被人为拆开了？多智能体能帮到前者，却只会给后者增加开销——本模块第 27—32 页会讲解具体的实现模式（编排者—工作者、辩论、层级结构、通信、共享状态、失败模式），以便在多智能体确实有帮助时把它做好。`,
    learningMapEn: `- Understand the "one agent, mixed roles" degradation problem
- See how role specialization (prompt, tools, model) fixes it
- Weigh coordination overhead and cost against the specialization benefit
- Apply the "genuinely distinct sub-roles?" decision test`,
    learningMapZh: `- 理解"单一智能体、多重角色混合"带来的性能下降问题
- 了解角色专业化（prompt、工具、模型）如何解决这一问题
- 权衡协调开销与成本相对于专业化收益
- 运用"是否存在真正独立的子角色？"这一判断标准`,
    handsOnEn: `1. Take a complex task your single agent handles and list the distinct roles mixed into its one prompt.
2. Split those roles into separate system prompts, one per role.
3. Estimate the extra LLM calls and coordination code this split requires.
4. Apply the decision test: are the roles genuinely distinct, or would this just add overhead?`,
    handsOnZh: `1. 找一个由你的单一智能体处理的复杂任务，列出混杂在同一个 prompt 中的各个不同角色。
2. 把这些角色拆分为各自独立的系统 prompt。
3. 估算这次拆分所需要增加的 LLM 调用次数和协调代码量。
4. 运用判断标准：这些角色是否真的各不相同，还是这样做只会徒增开销。`,
    resources: [
      {
        title: "Andrew Ng on Multi-agent collaboration (The Batch)",
        url: "https://x.com/AndrewYNg/status/1773393357022298617",
        description: "Ng's original framing of multi-agent collaboration as one of four agentic design patterns.",
      },
      {
        title: "CrewAI documentation",
        url: "https://docs.crewai.com/",
        description: "A framework built specifically around role-based agent teams.",
      },
    ],
  },
  {
    order: 27,
    key: "orchestrator-worker",
    titleEn: "Orchestrator-Worker Patterns",
    titleZh: "编排者—工作者模式",
    category: "skill",
    summaryEn:
      "The most common multi-agent shape: one orchestrator agent breaks a task down and delegates pieces to specialized worker agents, then assembles their results.",
    summaryZh: "最常见的多智能体结构：一个编排者智能体负责拆解任务并将其分派给专门的工作者智能体，再汇总它们的结果。",
    tags: ["agentic-ai", "multi-agent", "orchestrator-worker", "deeplearningai"],
    bodyEn: `The orchestrator-worker pattern (sometimes called "supervisor" or "manager-worker") is the default starting point for most multi-agent systems, precisely because it maps cleanly onto how the planning pattern (module 3) already works — the orchestrator is essentially a planner whose "execute a step" action is "delegate to a worker" instead of "call a tool."

The shape:

- **Orchestrator**: receives the task, decomposes it (module 3's decomposition strategies apply directly), and decides which worker handles each piece — and in what order, if pieces depend on each other.
- **Workers**: each a focused agent (or even a single tool-calling step) that handles one well-scoped sub-task and returns a structured result, without needing to know about the other workers or the overall goal.
- **Aggregation**: the orchestrator collects worker outputs and either assembles them directly into a final answer, or feeds them back into further reasoning/planning.

This pattern scales well because workers are interchangeable and independently improvable — swapping in a better "research worker" doesn't require touching the orchestrator or the "writing worker," as long as the interface (what the worker receives, what it returns) stays stable. The orchestrator itself is usually the most complex part to get right: it needs enough context to route sensibly, but not so much that it becomes a second copy of the mixed-role problem this whole module exists to avoid (see the previous page).`,
    bodyZh: `编排者—工作者模式（有时也称"主管—工作者"）是大多数多智能体系统的默认起点，原因在于它与规划模式（第 3 模块）本身的运作方式天然契合——编排者本质上就是一个规划者，只是它"执行一步"的动作是"委派给某个工作者"，而不是"调用一个工具"。

其结构如下：

- **编排者（Orchestrator）**：接收任务，对其进行拆解（第 3 模块的拆解策略在这里直接适用），并决定由哪个工作者处理每一部分——如果各部分之间存在依赖关系，还要决定执行顺序。
- **工作者（Workers）**：每个都是一个聚焦的智能体（甚至可以只是单一的工具调用步骤），负责处理一个范围明确的子任务，并返回一个结构化结果，不需要了解其他工作者或整体目标。
- **汇总（Aggregation）**：编排者收集各工作者的输出，要么直接将其组装成最终答案，要么将其反馈回去用于进一步的推理/规划。

这种模式之所以扩展性好，是因为工作者是可互换的、可独立改进的——替换一个更好的"研究工作者"，只要接口（工作者接收什么、返回什么）保持稳定，就不需要改动编排者或"写作工作者"。编排者本身通常是最难做好的部分：它需要足够的上下文来做出合理的路由决策，但又不能多到让自己变成本模块一直想要避免的"角色混合"问题的第二个翻版（见上一页）。`,
    learningMapEn: `- Understand orchestrator-worker as planning applied to agent delegation
- Learn the orchestrator / worker / aggregation roles
- See why interchangeable workers make the pattern scale well
- Recognize the orchestrator's own complexity as the main risk`,
    learningMapZh: `- 理解编排者—工作者模式是"规划"在智能体委派场景下的应用
- 掌握编排者/工作者/汇总三种角色
- 理解可互换的工作者为何能带来良好的扩展性
- 认识到编排者自身的复杂度是主要风险所在`,
    handsOnEn: `1. Design an orchestrator prompt that decomposes a task and assigns each piece to a named worker role.
2. Implement one worker as a narrowly-scoped agent with its own system prompt and tool set.
3. Define a structured result format each worker must return to the orchestrator.
4. Test swapping in an improved version of one worker without changing the orchestrator or other workers.`,
    handsOnZh: `1. 设计一个编排者 prompt，拆解任务并将每一部分分配给一个命名的工作者角色。
2. 实现一个工作者，作为一个范围狭窄的智能体，拥有自己的系统 prompt 和工具集。
3. 定义每个工作者必须返回给编排者的结构化结果格式。
4. 测试替换其中一个工作者的改进版本，且不改动编排者或其他工作者。`,
    resources: [
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "Reference implementation of supervisor/orchestrator graphs delegating to worker nodes.",
      },
      {
        title: "CrewAI documentation",
        url: "https://docs.crewai.com/",
        description: "Built-in manager/process abstractions for orchestrator-worker style crews.",
      },
    ],
  },
  {
    order: 28,
    key: "debate-and-consensus",
    titleEn: "Debate and Consensus Among Agents",
    titleZh: "智能体之间的辩论与共识",
    category: "skill",
    summaryEn:
      "Having multiple agents argue different positions before converging on an answer surfaces errors and blind spots that a single agent's confident first answer would have missed.",
    summaryZh: "让多个智能体在收敛出答案之前先就不同立场展开辩论，能揭示出单一智能体给出的自信初答会遗漏的错误与盲点。",
    tags: ["agentic-ai", "multi-agent", "debate", "deeplearningai"],
    bodyEn: `Debate patterns assign two or more agents to argue different positions (or independently produce answers, then critique each other's) before a final answer is settled on — a structural variant of reflection (module 1), but with a *different* agent doing the critiquing instead of the same one that generated the answer.

Common shapes:

- **Adversarial debate.** Two agents argue opposing conclusions; a judge agent (or the orchestrator) evaluates both arguments and decides. Useful for questions with a real "for/against" structure — risk assessments, decisions with trade-offs.
- **Independent-then-compare.** Multiple agents solve the same problem independently (ideally with some diversity — different prompts, different models, different temperatures), and a comparison step looks for agreement/disagreement. Strong agreement across independent solutions is a real (if imperfect) confidence signal; disagreement flags exactly where more scrutiny is needed.
- **Critique-and-defend.** One agent proposes, a second critiques, the first gets a chance to defend or revise — closer to peer review than adversarial debate.

Why this beats a single agent reflecting on itself: an agent critiquing its *own* work shares the same blind spots that produced the error in the first place (see the "agreement bias" problem on the reflection pages). A genuinely different agent — different prompt, different framing, sometimes a different model — is more likely to catch what the first agent couldn't see. The cost is real (multiple full generations plus a judge/comparison step), so debate is worth reserving for decisions where being wrong is expensive and a second, independent perspective plausibly catches something the first missed.`,
    bodyZh: `辩论模式让两个或更多智能体在最终答案敲定之前，先就不同立场展开辩论（或独立给出各自的答案，再互相批评）——这是反思模式（第 1 模块）的一种结构性变体，区别在于负责批评的是*另一个*智能体，而不是生成答案的那个智能体自己。

常见的形式包括：

- **对抗式辩论（Adversarial debate）。** 两个智能体分别论证相反的结论；一个评判智能体（或编排者）评估双方论点并做出决定。适用于确实存在"正方/反方"结构的问题——风险评估、涉及权衡取舍的决策。
- **独立求解后比较（Independent-then-compare）。** 多个智能体独立解决同一个问题（理想情况下带有一定多样性——不同的 prompt、不同的模型、不同的 temperature），再通过一个比较步骤查看它们是否一致。多个独立方案高度一致，是一个真实（尽管不完美）的置信信号；而出现分歧，则恰好标示出需要进一步审视的地方。
- **批评与辩护（Critique-and-defend）。** 一个智能体提出方案，第二个智能体提出批评，第一个智能体获得机会进行辩护或修订——这更接近同行评审，而非对抗式辩论。

这为何优于单一智能体的自我反思：一个智能体批评自己*的*工作时，会共享导致该错误的同一个盲点（参见反思那几页中提到的"附和偏向"问题）。而一个真正不同的智能体——不同的 prompt、不同的框架方式，有时甚至是不同的模型——更有可能发现第一个智能体看不到的问题。这样做的代价是真实存在的（需要多次完整生成再加一个评判/比较步骤），因此辩论模式最值得用在那些"出错代价高、且一个独立的第二视角确实有可能发现第一个视角遗漏之处"的决策上。`,
    learningMapEn: `- Learn 3 debate shapes: adversarial, independent-then-compare, critique-and-defend
- Understand why a different agent catches different errors than self-reflection
- Recognize agreement across independent solutions as a (imperfect) confidence signal
- Weigh debate's real cost against its value for high-stakes decisions`,
    learningMapZh: `- 掌握 3 种辩论形式：对抗式、独立求解后比较、批评与辩护
- 理解为何另一个智能体能发现自我反思发现不了的错误
- 认识到独立方案之间的一致性是一种（不完美的）置信信号
- 权衡辩论的真实成本与其对高风险决策的价值`,
    handsOnEn: `1. Pick a decision task and have two independently-prompted agents solve it separately.
2. Compare their outputs: do they agree? Where do they diverge?
3. Add a judge/comparison step that decides how to resolve disagreement.
4. Estimate the extra cost of this debate step and judge whether the task's stakes justify it.`,
    handsOnZh: `1. 选一个决策类任务，让两个独立设置 prompt 的智能体分别求解。
2. 比较它们的输出：是否一致？分歧出现在哪里？
3. 加入一个评判/比较步骤，用于决定如何处理分歧。
4. 估算这一辩论步骤的额外成本，判断该任务的风险是否值得付出这一代价。`,
    resources: [
      {
        title: "Improving Factuality and Reasoning in Language Models through Multiagent Debate",
        url: "https://arxiv.org/abs/2305.14325",
        description: "Academic study on multi-agent debate improving accuracy over single-agent self-reflection.",
      },
      {
        title: "AutoGen — Microsoft Research",
        url: "https://microsoft.github.io/autogen/",
        description: "A framework with built-in conversational patterns for multi-agent critique and debate.",
      },
    ],
  },
  {
    order: 29,
    key: "hierarchical-agent-teams",
    titleEn: "Hierarchical Agent Teams",
    titleZh: "层级式智能体团队",
    category: "skill",
    summaryEn:
      "For tasks too large for a flat orchestrator-worker structure, agents can themselves manage sub-teams — the same division-of-labor principle applied recursively.",
    summaryZh: "对于超出扁平化编排者—工作者结构承载能力的任务，智能体本身也可以管理各自的子团队——这是把同样的分工原则递归应用的结果。",
    tags: ["agentic-ai", "multi-agent", "hierarchy", "deeplearningai"],
    bodyEn: `A flat orchestrator-worker setup (page 27) works well while the orchestrator can reasonably reason about all its workers at once. Past a certain number of workers or a certain task complexity, the orchestrator itself starts to suffer the same "too many things in one context" problem this whole module exists to solve.

Hierarchical teams fix this by nesting the pattern: a top-level orchestrator delegates to **mid-level manager agents**, each of which is itself an orchestrator for its own small team of workers, and only reports summarized results upward — the top-level orchestrator never sees the mid-level managers' internal coordination, only their outcomes.

This mirrors human organizational hierarchy for the same reason: it bounds how much any single node needs to reason about at once. A VP doesn't need visibility into every individual engineer's daily standup; they need their directors' summarized status. Concretely useful when:

- A task naturally decomposes into a small number of large *domains* (e.g. "research," "writing," "fact-checking"), each of which further decomposes into several sub-tasks.
- The team is large enough (roughly 6+ workers) that a flat orchestrator's routing decisions start degrading in quality.
- Different domains genuinely need different coordination styles (one sub-team might use debate, another a simple sequential pipeline) — nesting lets each manager choose what fits its own workers.

The cost is added latency (results pass through more hops before reaching the top) and added complexity in defining what each level is allowed to see — worth it only once a flat structure has actually started showing routing errors, not pre-emptively.`,
    bodyZh: `当编排者能够合理地同时考虑到所有工作者时，扁平化的编排者—工作者结构（第 27 页）运作得很好。但一旦工作者数量或任务复杂度超过某个临界点，编排者本身就会开始遭遇本模块一直试图解决的那种"上下文中塞进太多东西"的问题。

层级式团队通过嵌套这一模式来解决这个问题：一个顶层编排者把任务委派给若干**中层管理智能体**，而每个中层管理智能体本身又是其自己那支小型工作者团队的编排者，只把汇总后的结果向上汇报——顶层编排者从不了解中层管理者内部的协调细节，只看到他们的结果。

这与人类组织的层级结构如出一辙，原因也相同：它限定了任何单一节点一次需要推理的信息量。副总裁不需要了解每个工程师每天站会的细节，只需要总监汇总后的状态。以下情形下这种做法尤为有用：

- 一个任务自然地分解为少数几个大的*领域*（例如"研究"、"写作"、"事实核查"），每个领域又进一步拆分为若干子任务。
- 团队规模足够大（大致 6 名以上工作者），以至于扁平化编排者的路由决策质量开始下降。
- 不同领域确实需要不同的协调方式（某个子团队可能采用辩论模式，另一个则采用简单的顺序流水线）——嵌套结构让每个管理者可以为自己的工作者选择最合适的方式。

其代价是延迟增加（结果要经过更多跳转才能到达顶层），以及在定义"每一层级可以看到什么"上增加了复杂度——只有当扁平结构已经实际出现路由错误时才值得采用，而不应提前预防性地引入。`,
    learningMapEn: `- Understand hierarchy as recursively applied orchestrator-worker
- Learn the manager-agent role: sub-orchestrator that reports summaries upward
- Identify 3 concrete triggers for going hierarchical
- Weigh added latency/complexity against flat-structure routing errors`,
    learningMapZh: `- 理解层级结构是编排者—工作者模式的递归应用
- 掌握"管理智能体"角色：作为子编排者、向上汇报摘要结果
- 识别应转向层级结构的 3 个具体触发条件
- 权衡增加的延迟/复杂度与扁平结构的路由错误`,
    handsOnEn: `1. Take a flat orchestrator-worker setup with 6+ workers and group them into 2-3 domains.
2. Assign a manager agent to each domain, responsible for its own sub-team.
3. Define what summary format each manager reports upward to the top-level orchestrator.
4. Compare routing accuracy and latency before/after introducing the hierarchy.`,
    handsOnZh: `1. 找一个拥有 6 名以上工作者的扁平编排者—工作者结构，把它们分成 2—3 个领域。
2. 为每个领域指派一个管理智能体，负责各自的子团队。
3. 定义每个管理者向顶层编排者汇报时应使用的摘要格式。
4. 比较引入层级结构前后的路由准确率和延迟。`,
    resources: [
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "Supports nested graphs/subgraphs, a direct implementation vehicle for hierarchical teams.",
      },
      {
        title: "AutoGen — Microsoft Research",
        url: "https://microsoft.github.io/autogen/",
        description: "Group-chat and nested-team abstractions for multi-agent coordination at scale.",
      },
    ],
  },
  {
    order: 30,
    key: "communication-protocols",
    titleEn: "Communication Protocols Between Agents",
    titleZh: "智能体之间的通信协议",
    category: "api",
    summaryEn:
      "How agents pass messages to each other — structured or free-text, direct or via shared state — determines how reliably a multi-agent system actually coordinates.",
    summaryZh: "智能体之间如何传递消息——结构化还是自由文本、直接传递还是通过共享状态——决定了多智能体系统实际协调的可靠程度。",
    tags: ["agentic-ai", "multi-agent", "communication", "deeplearningai"],
    bodyEn: `Once a task involves more than one agent, how they exchange information becomes its own design surface, with real reliability consequences.

**Structured vs. free-text messages.** A worker returning \`{"status": "success", "data": {...}, "confidence": 0.9}\` is far easier for an orchestrator to route on reliably than a worker returning a paragraph the orchestrator has to re-interpret with another LLM call. Reserve free-text for genuinely unstructured content (a draft of prose); use schemas for anything the receiving agent needs to make a decision based on.

**Direct message-passing vs. shared state.** In direct passing, agent A's output becomes part of agent B's input explicitly — simple to reason about, but doesn't scale past a few agents without the orchestrator manually wiring every hand-off. Shared state (a blackboard, covered on the next page) lets any agent read/write a common store — scales better, at the cost of needing clear conventions about who owns which part of the state.

**Synchronous vs. asynchronous.** Most multi-agent systems today are synchronous — agent B waits for agent A to finish. Asynchronous patterns (agent A keeps working while agent B processes A's partial output) are more complex to implement correctly but necessary once individual agent calls are slow enough that serial waiting becomes the task's actual bottleneck.

**Protocol standardization matters at integration boundaries.** Where agents from different teams, vendors, or codebases need to talk to each other (not just agents you wrote yourself), standard protocols matter the same way MCP standardizes tool access (module 2) — an emerging area to watch as multi-agent systems increasingly span organizational boundaries, not just a single codebase.`,
    bodyZh: `一旦一个任务涉及不止一个智能体，它们之间如何交换信息，就成了一个独立的设计问题，并带来真实的可靠性后果。

**结构化消息 vs. 自由文本消息。** 一个工作者返回 \`{"status": "success", "data": {...}, "confidence": 0.9}\`，比返回一段编排者还需要再用一次 LLM 调用去重新解读的文字段落，要更容易被可靠地路由。把自由文本留给真正无结构的内容（例如一段散文草稿）；对于接收方智能体需要据此做决策的任何内容，都应使用 schema。

**直接消息传递 vs. 共享状态。** 在直接传递中，智能体 A 的输出被显式地作为智能体 B 输入的一部分——推理起来简单，但一旦智能体数量超过几个，就需要编排者手动接线每一次交接，扩展性不佳。共享状态（黑板模式，下一页会讲）让任何智能体都可以读写一个公共存储——扩展性更好，代价是需要明确约定谁拥有状态的哪一部分。

**同步 vs. 异步。** 目前大多数多智能体系统是同步的——智能体 B 等待智能体 A 完成。异步模式（智能体 A 持续工作，同时智能体 B 处理 A 的部分输出）实现起来要正确得多地复杂，但一旦单个智能体调用足够慢、串行等待成为任务的真正瓶颈，异步就变得必要。

**在集成边界处，协议标准化尤为重要。** 当来自不同团队、不同厂商、不同代码库的智能体需要相互对话（而不仅仅是你自己写的智能体之间），标准协议就变得重要，其道理与 MCP 标准化工具接入（第 2 模块）相同——随着多智能体系统越来越多地跨越组织边界，而不再局限于单一代码库，这是一个值得持续关注的新兴领域。`,
    learningMapEn: `- Compare structured vs. free-text messages and when each fits
- Compare direct message-passing vs. shared state
- Understand synchronous vs. asynchronous coordination trade-offs
- Recognize where cross-organization protocol standardization matters`,
    learningMapZh: `- 比较结构化消息与自由文本消息，理解各自适用场景
- 比较直接消息传递与共享状态
- 理解同步与异步协调各自的权衡
- 认识跨组织的协议标准化在哪些场景下变得重要`,
    handsOnEn: `1. Take one agent-to-agent hand-off in your system and define a JSON schema for it.
2. Replace a free-text worker output with that schema and confirm the orchestrator's routing simplifies.
3. Identify one place where shared state would reduce manual wiring compared to direct passing.
4. Note which of your agent calls are the actual latency bottleneck, and whether async is worth the complexity there.`,
    handsOnZh: `1. 找一个你系统中智能体之间的交接点，为它定义一个 JSON schema。
2. 用该 schema 替换一个自由文本的工作者输出，确认编排者的路由逻辑是否变得更简单。
3. 找出一处共享状态相比直接传递能减少手动接线的地方。
4. 找出你的哪些智能体调用是真正的延迟瓶颈，并判断在那里引入异步是否值得付出复杂度代价。`,
    resources: [
      {
        title: "AutoGen — Microsoft Research",
        url: "https://microsoft.github.io/autogen/",
        description: "Conversational message-passing abstractions between agents, including structured message types.",
      },
      {
        title: "Model Context Protocol — official docs",
        url: "https://modelcontextprotocol.io/",
        description: "A standardization precedent for cross-boundary agent/tool communication.",
      },
    ],
  },
  {
    order: 31,
    key: "shared-state-blackboard",
    titleEn: "Shared State and Blackboard Architectures",
    titleZh: "共享状态与黑板架构",
    category: "skill",
    summaryEn:
      "In a blackboard architecture, agents don't message each other directly — they read and write a shared workspace, and coordination emerges from what each agent chooses to act on.",
    summaryZh: "在黑板架构中，智能体之间并不直接互发消息——它们读写一个共享的工作区，协调则源自每个智能体选择对什么内容采取行动。",
    tags: ["agentic-ai", "multi-agent", "shared-state", "deeplearningai"],
    bodyEn: `The blackboard pattern, borrowed from classic AI architectures predating LLMs, decouples agents from each other entirely: instead of agent A sending agent B a message, agent A writes to a shared state store (the "blackboard"), and any agent — including B — can read from it and decide whether to act.

This is how most graph-based agent frameworks (LangGraph, notably) actually implement multi-agent systems under the hood: a shared state object flows through the graph, each node (agent) reads the parts of state relevant to it, and writes updates back, rather than nodes calling each other directly.

Benefits: agents don't need to know about each other's existence, just the shape of the shared state — this makes adding a new agent (a new "listener" on the blackboard) low-friction, since existing agents don't need to change. It also makes debugging more tractable, since the entire system's state at any point is inspectable as one object rather than scattered across in-flight messages.

The design work that actually matters: defining **state ownership** — which fields does each agent read, which does it write, and what happens if two agents try to write the same field in the same step (last-write-wins? merge? reject?). Frameworks that support this pattern (LangGraph's state reducers are the clearest example) make you answer that question explicitly rather than leaving it to accidental behavior — treat that as a feature, not friction, since silent write-conflicts are a common source of hard-to-debug multi-agent failures.`,
    bodyZh: `黑板模式借鉴自早于 LLM 出现的经典 AI 架构，它让智能体之间彻底解耦：智能体 A 不是把消息发送给智能体 B，而是把内容写入一个共享的状态存储（即"黑板"），任何智能体——包括 B——都可以从中读取，并自行决定是否要据此采取行动。

这正是大多数基于图的智能体框架（尤其是 LangGraph）在底层实现多智能体系统的方式：一个共享的状态对象在图中流动，每个节点（智能体）读取与自己相关的状态部分，并把更新写回，而不是节点之间直接互相调用。

好处在于：智能体不需要知道彼此的存在，只需要知道共享状态的结构——这使得新增一个智能体（黑板上新增一个"监听者"）变得成本很低，因为现有智能体不需要为此改动。它也让调试变得更可控，因为系统在任意时刻的完整状态，都可以作为一个对象整体被检视，而不是散落在飞行中的各条消息里。

真正重要的设计工作在于：明确**状态所有权**——每个智能体读取哪些字段、写入哪些字段，以及如果两个智能体在同一步试图写同一个字段该怎么办（后写覆盖？合并？拒绝？）。支持这种模式的框架（LangGraph 的 state reducer 是最典型的例子）会要求你显式回答这个问题，而不是任其成为一种偶然行为——应把这看作一项特性，而非阻碍，因为无声的写入冲突正是多智能体系统中难以调试的常见故障根源。`,
    learningMapEn: `- Understand the blackboard pattern: shared state instead of direct messaging
- See how graph-based frameworks implement multi-agent coordination via shared state
- Learn why low agent-coupling makes adding new agents low-friction
- Master the "state ownership" design question and write-conflict resolution`,
    learningMapZh: `- 理解黑板模式：用共享状态取代直接消息传递
- 了解基于图的框架如何通过共享状态实现多智能体协调
- 理解低耦合为何让新增智能体的成本变低
- 掌握"状态所有权"这一设计问题及写入冲突的解决方式`,
    handsOnEn: `1. Define a shared state schema for a multi-agent task (fields, types, owners).
2. Assign, for each field, which agent(s) may read it and which may write it.
3. Decide an explicit conflict-resolution rule for any field two agents might write in the same step.
4. Add a new agent as a new "listener" on existing state without modifying any existing agent.`,
    handsOnZh: `1. 为一个多智能体任务定义共享状态的 schema（字段、类型、所有者）。
2. 为每个字段指定哪些智能体可以读取、哪些可以写入。
3. 为任何可能被两个智能体在同一步写入的字段，明确一条冲突解决规则。
4. 在不修改任何现有智能体的前提下，新增一个智能体作为现有状态的新"监听者"。`,
    resources: [
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "Shared graph state with explicit reducers — a concrete blackboard implementation.",
      },
      {
        title: "AutoGen — Microsoft Research",
        url: "https://microsoft.github.io/autogen/",
        description: "Group-chat shared context as an alternative shared-state coordination mechanism.",
      },
    ],
  },
  {
    order: 32,
    key: "avoiding-coordination-failures",
    titleEn: "Avoiding Coordination Failures in Multi-Agent Systems",
    titleZh: "避免多智能体系统中的协调失败",
    category: "best-practices",
    summaryEn:
      "Most multi-agent failures aren't any single agent being wrong — they're coordination breakdowns: duplicated work, contradicted decisions, or nobody actually finishing the task.",
    summaryZh: "多智能体系统中的大多数失败，并非某个智能体单独出错，而是协调层面的崩溃：工作重复、决策相互矛盾，或者根本没有任何一方真正完成任务。",
    tags: ["agentic-ai", "multi-agent", "best-practices", "deeplearningai"],
    bodyEn: `Individually-correct agents can still produce a badly wrong overall result if the coordination layer between them is weak. The recurring failure modes worth designing against explicitly:

- **Duplicated work.** Two agents independently do the same sub-task because neither knew the other had claimed it — usually a missing "claim/lock" mechanism on shared state, or an orchestrator that dispatches without checking what's already in flight.
- **Contradictory outputs going unreconciled.** Agent A concludes X, agent B (unaware of A's conclusion) concludes not-X, and both get merged into a final answer without anyone catching the contradiction — needs an explicit reconciliation/judge step, not an assumption that outputs will naturally agree.
- **Nobody owns "done."** In a loosely-coordinated system, it's possible for every agent to finish its own sub-task while no agent (and no orchestrator logic) ever checks whether the *overall* goal was actually achieved — always have an explicit final verification step, owned by someone.
- **Infinite ping-pong.** Agent A hands back to agent B, which hands back to A, neither making progress — needs a hard step/round cap and a designated tie-breaker (usually the orchestrator) that can force resolution.
- **Context loss across hand-offs.** Agent B doesn't have information agent A had, because the hand-off only passed a summary — decide deliberately what's in a hand-off payload rather than defaulting to "whatever fits."

The general defense: **make the orchestrator (or a lightweight monitor) responsible for verifying the overall goal, not just for dispatching sub-tasks** — dispatch-and-hope is where most of these failures originate.`,
    bodyZh: `即便每个智能体本身都是正确的，如果它们之间的协调层薄弱，整体结果仍然可能严重出错。以下是值得专门针对性设计的反复出现的失败模式：

- **重复劳动。** 两个智能体各自独立完成了同一个子任务，因为谁都不知道对方已经认领了它——通常是共享状态上缺少"认领/加锁"机制，或者编排者在派发任务时没有检查已在进行中的工作。
- **矛盾的输出未被调和。** 智能体 A 得出结论 X，智能体 B（不知道 A 的结论）得出结论"非 X"，两者被合并进最终答案，却没有任何一方发现这一矛盾——需要一个明确的调和/评判步骤，而不能假设各智能体的输出会自然一致。
- **没有人负责判断"完成"。** 在协调松散的系统中，可能出现每个智能体都完成了自己的子任务，却没有任何智能体（也没有任何编排逻辑）真正检查过*整体*目标是否达成——务必设置一个明确的最终验证步骤，并指定由谁负责。
- **无限乒乓（Infinite ping-pong）。** 智能体 A 把工作交回给智能体 B，B 又交回给 A，双方都没有实质进展——需要设定硬性的步数/轮次上限，并指定一个仲裁者（通常是编排者）来强制推进。
- **交接过程中的上下文丢失。** 智能体 B 没有智能体 A 曾拥有的信息，因为交接时只传递了一份摘要——应刻意决定交接负载中应包含什么，而不是默认"能塞进去多少算多少"。

总体的防御原则是：**让编排者（或一个轻量级监控者）不仅负责派发子任务，还要对整体目标的达成负责**——大多数此类失败，正是源于"派发之后就听天由命"的做法。`,
    learningMapEn: `- Learn 5 recurring failure modes: duplicated work, unreconciled contradictions, no owner of "done," ping-pong, context loss
- Understand claim/lock mechanisms for avoiding duplicated work
- Design an explicit reconciliation/judge step for contradictions
- Make the orchestrator responsible for goal verification, not just dispatch`,
    learningMapZh: `- 掌握 5 种反复出现的失败模式：重复劳动、矛盾未调和、无人负责"完成"、无限乒乓、上下文丢失
- 理解用于避免重复劳动的认领/加锁机制
- 为矛盾情形设计明确的调和/评判步骤
- 让编排者不仅负责派发，也对目标验证负责`,
    handsOnEn: `1. Audit your multi-agent system for a duplicated-work risk and add a claim/lock mechanism if missing.
2. Add an explicit reconciliation step wherever two agents might reach contradictory conclusions.
3. Add a final verification step that checks the overall goal, owned by the orchestrator, not assumed.
4. Set a hard round cap on any back-and-forth between two agents.`,
    handsOnZh: `1. 审查你的多智能体系统是否存在重复劳动风险，如缺少认领/加锁机制则补上。
2. 在任何两个智能体可能得出矛盾结论的地方，加入明确的调和步骤。
3. 加入一个由编排者负责的最终验证步骤，用于检查整体目标是否达成，而不是想当然地假设。
4. 为任何两个智能体之间的来回交互设定硬性轮次上限。`,
    resources: [
      {
        title: "AutoGen — Microsoft Research",
        url: "https://microsoft.github.io/autogen/",
        description: "Documents termination conditions and round caps for multi-agent conversations.",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Warns against unbounded multi-agent hand-offs without an explicit verification owner.",
      },
    ],
  },
];
