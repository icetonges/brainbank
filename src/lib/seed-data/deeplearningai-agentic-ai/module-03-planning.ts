import type { SeedPage } from "./types";

// Module 3 — Planning (7 pages, order 19-25). Third of Andrew Ng's four
// agentic design patterns.
export const module03Planning: SeedPage[] = [
  {
    order: 19,
    key: "react-reasoning-acting",
    titleEn: "ReAct: Reasoning and Acting in Language Models",
    titleZh: "ReAct：语言模型中的推理与行动",
    category: "knowledge",
    summaryEn:
      "ReAct interleaves explicit reasoning traces with actions and their observations, and is the pattern underneath most modern tool-using agent loops.",
    summaryZh: "ReAct 将显式的推理过程与行动及其观察结果交替进行，是当今大多数使用工具的智能体循环背后的模式。",
    tags: ["agentic-ai", "planning", "react", "deeplearningai"],
    bodyEn: `The 2022 ReAct paper (Yao et al.) introduced a simple but influential prompting pattern: instead of asking a model to either reason silently and answer, or act without explaining why, have it alternate explicit **Thought → Action → Observation** steps in the same trace.

A ReAct trace looks like:

\`\`\`
Thought: I need to find X before I can answer the question.
Action: search("X")
Observation: [search result]
Thought: That answers part of it, but I still need Y.
Action: search("Y")
Observation: [search result]
Thought: I now have enough to answer.
Action: finish("...")
\`\`\`

Two things make this more than a formatting trick. First, writing out the "Thought" before choosing an action measurably improves action quality — it's chain-of-thought reasoning applied specifically to *deciding what to do next*, not just to answering. Second, having each Observation appear explicitly in the trace means later Thoughts are conditioned on real environment feedback, not on the model's assumption of what an action *probably* returned.

ReAct is less a specific framework and more the underlying loop structure that essentially every subsequent tool-using agent architecture (including LangGraph's agent nodes and most custom orchestrators) has converged on. Understanding the Thought/Action/Observation trace is close to a prerequisite for reading how any modern agent framework actually executes a step.`,
    bodyZh: `2022 年的 ReAct 论文（Yao 等）提出了一种简单却影响深远的 prompt 模式：不再让模型要么默默推理后直接作答，要么不加解释地直接行动，而是让它在同一条轨迹中交替进行显式的**思考（Thought）→ 行动（Action）→ 观察（Observation）**步骤。

一条 ReAct 轨迹看起来像这样：

\`\`\`
Thought: 我需要先找到 X，才能回答这个问题。
Action: search("X")
Observation: [搜索结果]
Thought: 这回答了部分问题，但我还需要 Y。
Action: search("Y")
Observation: [搜索结果]
Thought: 现在信息足够了，可以作答。
Action: finish("...")
\`\`\`

这不仅仅是一种格式技巧，原因有两点。第一，在选择行动之前先写出"Thought"，能可衡量地提升行动质量——这是把思维链（chain-of-thought）推理专门应用到"决定下一步做什么"上，而不仅仅是应用到"作答"上。第二，让每一次 Observation 都显式出现在轨迹中，意味着之后的 Thought 是基于真实的环境反馈来推理的，而不是基于模型对某个行动"大概会返回什么"的假设。

与其说 ReAct 是一个具体的框架，不如说它是几乎所有后续使用工具的智能体架构（包括 LangGraph 的智能体节点和大多数自定义编排器）最终都收敛到的底层循环结构。理解 Thought/Action/Observation 这条轨迹，几乎是理解任何现代智能体框架究竟如何执行一个步骤的前提。`,
    learningMapEn: `- Learn the Thought → Action → Observation trace structure
- Understand why explicit reasoning before action improves quality
- Recognize ReAct as the loop structure underneath most modern frameworks
- Preview: Chain-of-Thought's limits are covered next`,
    learningMapZh: `- 掌握 Thought → Action → Observation 的轨迹结构
- 理解为何在行动前进行显式推理能提升质量
- 认识到 ReAct 是大多数现代框架底层所依循的循环结构
- 预告：下一页将讲解思维链的局限`,
    handsOnEn: `1. Write out a ReAct-style trace by hand for a simple task ("what's the weather where the Eiffel Tower is").
2. Implement a prompt that asks the model to output Thought/Action/Observation explicitly.
3. Compare an agent run with visible Thoughts vs. one where Thoughts are suppressed — track action-selection accuracy.
4. Identify one place in your existing agent where an Observation isn't actually being fed back before the next decision.`,
    handsOnZh: `1. 为一个简单任务（"埃菲尔铁塔所在地的天气如何"）手动写出一条 ReAct 风格的轨迹。
2. 实现一个要求模型显式输出 Thought/Action/Observation 的 prompt。
3. 对比"可见 Thought"与"隐藏 Thought"两种运行方式，追踪行动选择的准确率。
4. 在你现有的智能体中找出一处 Observation 实际上并未在下一次决策前被反馈回去的地方。`,
    resources: [
      {
        title: "ReAct: Synergizing Reasoning and Acting in Language Models",
        url: "https://arxiv.org/abs/2210.03629",
        description: "The original paper — Thought/Action/Observation traces with benchmark results.",
      },
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "A modern framework whose agent nodes implement a ReAct-style loop.",
      },
    ],
  },
  {
    order: 20,
    key: "chain-of-thought-limits",
    titleEn: "Chain-of-Thought and Its Limits for Agents",
    titleZh: "思维链及其在智能体场景下的局限",
    category: "knowledge",
    summaryEn:
      "Chain-of-thought improves single-turn reasoning, but reasoning that's never checked against the real world is just an elaborate way to be confidently wrong.",
    summaryZh: "思维链能提升单轮推理的质量，但从未与真实世界进行核对的推理，只是一种更精致的、自信地犯错的方式。",
    tags: ["agentic-ai", "planning", "chain-of-thought", "deeplearningai"],
    bodyEn: `Chain-of-thought (CoT) prompting — asking a model to "think step by step" before answering — reliably improves performance on multi-step reasoning tasks by giving the model room to work through intermediate steps rather than jumping straight to an answer. It's a foundational technique, and ReAct (previous page) is partly CoT applied to action selection.

Its limits matter specifically for agent design:

- **CoT reasons about the world as the model imagines it, not as it actually is.** A chain of thought about "what this API probably returns" is not a substitute for actually calling the API — this is exactly the gap Tool Use (module 2) exists to close.
- **Long chains can drift.** Without a real observation to anchor each step, a sufficiently long chain of reasoning can compound small errors into a confidently wrong conclusion — verbose reasoning is not the same as correct reasoning.
- **CoT doesn't replace planning.** Reasoning step-by-step toward one answer is different from *decomposing a task into a sequence of independently executable sub-tasks* — the latter is what the rest of this module covers, and often requires explicit plan structures, not just a longer reasoning trace.
- **It's not free.** Longer chains cost more tokens and latency; the gain has to justify the cost, same discipline as reflection (module 1).

The practical takeaway: use CoT to think *before* acting, but ground each step in a real observation as soon as one is available, rather than reasoning several steps ahead of what's actually been verified.`,
    bodyZh: `思维链（CoT）prompting——即在作答前要求模型"逐步思考"——能可靠地提升多步推理任务的表现，因为它让模型有空间去处理中间步骤，而不是直接跳到答案。这是一项基础技术，ReAct（上一页）在某种程度上就是把 CoT 应用到了行动选择上。

它的局限对智能体设计尤为重要：

- **CoT 推理的是模型"想象中"的世界，而非真实世界。** 一段关于"这个 API 大概会返回什么"的思维链，无法替代真正去调用该 API——这正是"工具使用"（第 2 模块）要弥合的差距。
- **长链条可能会漂移。** 如果没有真实的观察结果来锚定每一步，足够长的推理链会把微小的错误不断累积放大，最终得出一个自信满满却错误的结论——冗长的推理并不等于正确的推理。
- **CoT 不能替代规划。** 逐步推理得出一个答案，与*把一个任务拆解为一系列可独立执行的子任务*是不同的——后者正是本模块接下来要讲的内容，往往需要显式的计划结构，而不仅仅是一条更长的推理轨迹。
- **它并非没有代价。** 更长的链条意味着更多 token 和延迟成本；收益必须能证明这一成本是合理的，这与反思模式（第 1 模块）遵循同样的纪律。

实践上的结论是：用 CoT 来"在行动前思考"，但一旦有真实的观察结果可用，就立刻用它来锚定每一步，而不是在已验证的信息之外再推理好几步。`,
    learningMapEn: `- Understand what CoT is and why it helps single-turn reasoning
- Learn 4 limits: imagined vs. real world, drift, not a planning substitute, cost
- Connect CoT's gap directly to why Tool Use and Planning exist as separate patterns
- Practice grounding a long reasoning chain with an early real observation`,
    learningMapZh: `- 理解 CoT 是什么、为何有助于单轮推理
- 掌握 4 个局限：想象世界 vs. 真实世界、漂移、不能替代规划、成本
- 把 CoT 的缺口与"工具使用"和"规划"作为独立模式存在的原因联系起来
- 练习用尽早获得的真实观察结果来锚定一条长推理链`,
    handsOnEn: `1. Write a CoT prompt for a task that involves an API call, and note where the model "imagines" the API's response instead of calling it.
2. Rewrite the prompt so the model calls the real tool at that point instead of reasoning about it.
3. Test a deliberately long reasoning chain and check whether later steps drift from the actual goal.
4. Measure the token/latency cost of your CoT prompt vs. a shorter direct-answer version.`,
    handsOnZh: `1. 为一个涉及 API 调用的任务写一个 CoT prompt，找出模型在哪一处"想象"了 API 的响应而不是真正调用它。
2. 重写该 prompt，让模型在那个位置真正调用工具，而不是对其进行推理。
3. 测试一条故意拉长的推理链，检查后续步骤是否偏离了真实目标。
4. 对比你的 CoT prompt 与一个更简短的直接作答版本，测量 token/延迟成本。`,
    resources: [
      {
        title: "ReAct: Synergizing Reasoning and Acting in Language Models",
        url: "https://arxiv.org/abs/2210.03629",
        description: "Directly compares pure chain-of-thought against reasoning grounded in real actions/observations.",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Cautions against over-relying on long reasoning chains without environment grounding.",
      },
    ],
  },
  {
    order: 21,
    key: "plan-and-execute-agents",
    titleEn: "Plan-and-Execute Agents",
    titleZh: "先规划后执行的智能体",
    category: "skill",
    summaryEn:
      "Instead of deciding one step at a time, a plan-and-execute agent commits to a multi-step plan up front, then executes and revises it — trading some flexibility for far fewer wasted LLM calls.",
    summaryZh: "先规划后执行的智能体，不是一步步地临时决定，而是先一次性制定出多步计划，再据此执行并按需修订——用一定的灵活性换取显著减少的无效 LLM 调用。",
    tags: ["agentic-ai", "planning", "plan-and-execute", "deeplearningai"],
    bodyEn: `A pure ReAct-style loop (previous pages) decides its next action one step at a time, re-reasoning from scratch after every observation. That's flexible but expensive: every single step re-invokes the full reasoning process, even for steps whose outcome barely depends on what just happened.

**Plan-and-execute** splits the work into two roles:

1. **Planner**: given the goal, produce an ordered list of sub-tasks up front — e.g. "1) find the company's latest 10-K, 2) extract revenue by segment, 3) compute YoY growth, 4) summarize."
2. **Executor**: work through the plan's steps, calling whatever tools each step needs, without re-planning from scratch after each one.

The efficiency win is real — one planning call instead of N re-reasoning calls — but the trade-off is real too: a plan made before execution starts can be wrong about what step 3 will actually find, and a naive plan-and-execute agent can charge through a stale plan even after step 1's result invalidates it.

The fix most production systems use is **plan-and-execute with re-planning**: execute the plan, but after each step (or after a step fails, or after a result contradicts an assumption the plan was built on), give the planner a chance to revise the remaining steps rather than blindly continuing. This is covered in depth on the "Re-Planning" page later in this module — treat plan-and-execute as the default structure, and re-planning as the safety valve that keeps it from failing silently.`,
    bodyZh: `纯粹的 ReAct 式循环（前几页）是一步一步地决定下一个行动，每次观察之后都要从头重新推理。这样做很灵活，但代价也很高：即便某一步的结果几乎不依赖于刚刚发生的事情，每一步仍然要重新调用一次完整的推理过程。

**先规划后执行（Plan-and-execute）**把工作拆分为两个角色：

1. **规划者（Planner）**：给定目标后，一次性产出一份有序的子任务清单——例如"1）找到该公司最新的 10-K 报告，2）按业务分部提取营收，3）计算同比增长，4）总结"。
2. **执行者（Executor）**：按计划逐步推进，为每一步调用所需的工具，而不必在每一步之后都从头重新规划。

这种做法带来的效率提升是实实在在的——只需一次规划调用，而不是 N 次重新推理调用——但代价同样真实：在执行开始前制定的计划，可能对第 3 步实际会发现什么做出了错误预判；一个朴素的先规划后执行智能体，即便在第 1 步的结果已经使原计划失效之后，仍可能机械地继续执行这份过时的计划。

大多数生产系统采用的解决办法是**带重新规划的先规划后执行**：按计划执行，但在每一步之后（或某一步失败之后，或某个结果与计划所依赖的假设相矛盾之后），给规划者一次修订剩余步骤的机会，而不是盲目地继续下去。本模块后面的"重新规划"一页会深入讲解这一点——把先规划后执行当作默认结构，把重新规划当作防止其悄无声息失败的安全阀。`,
    learningMapEn: `- Compare per-step reasoning (ReAct) vs. up-front planning (plan-and-execute)
- Understand the planner/executor role split
- Recognize the stale-plan failure mode
- Preview: re-planning as the fix, covered later in this module`,
    learningMapZh: `- 对比逐步推理（ReAct）与一次性规划（先规划后执行）
- 理解规划者/执行者的角色分工
- 识别"过时计划"这一失败模式
- 预告：重新规划作为解决方案，将在本模块后面讲解`,
    handsOnEn: `1. Take a multi-step task and write a planner prompt that outputs an ordered list of sub-tasks.
2. Implement an executor that works through that list, calling tools per step.
3. Deliberately break step 1's assumption (e.g. return an unexpected result) and observe whether the executor blindly continues.
4. Note where you'd insert a re-planning check based on that observation.`,
    handsOnZh: `1. 选一个多步骤任务，写一个规划者 prompt，输出一份有序的子任务清单。
2. 实现一个执行者，按该清单逐步推进，为每一步调用工具。
3. 故意打破第 1 步的假设（例如返回一个意外结果），观察执行者是否会盲目继续。
4. 基于这一观察，标出应在何处插入重新规划检查点。`,
    resources: [
      {
        title: "Plan-and-Solve Prompting",
        url: "https://arxiv.org/abs/2305.04091",
        description: "Academic formalization of separating planning from execution in LLM reasoning.",
      },
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "Shows plan-and-execute as a named reference architecture built on graph state.",
      },
    ],
  },
  {
    order: 22,
    key: "tree-of-thoughts",
    titleEn: "Tree of Thoughts and Search-Based Planning",
    titleZh: "思维树与基于搜索的规划",
    category: "knowledge",
    summaryEn:
      "Tree of Thoughts generates and compares multiple candidate next-steps rather than committing to the first one, turning planning into an explicit search problem.",
    summaryZh: "思维树不是直接采纳第一个想到的方案，而是生成并比较多个候选的下一步，把规划变成一个显式的搜索问题。",
    tags: ["agentic-ai", "planning", "tree-of-thoughts", "deeplearningai"],
    bodyEn: `Both ReAct and plain plan-and-execute commit to one line of reasoning at a time — if step 2's chosen approach turns out to be a dead end, the agent typically only discovers that after already spending the tokens and tool calls to try it.

**Tree of Thoughts (ToT)**, from Yao et al. (2023), reframes planning as search: at each decision point, generate *several* candidate next-steps (not just one), evaluate each candidate (with the model itself, a heuristic, or an external check), and expand the most promising ones — classic search algorithms like breadth-first or depth-first search, applied to a tree of reasoning states rather than a state-space of moves in a game.

This buys real robustness on tasks with dead ends or backtracking (puzzles, certain planning problems, code with several plausible approaches), at a real cost: generating and evaluating multiple candidates at every branch multiplies token usage by however many branches you explore, often by a large factor. It's rarely worth it for tasks with an obvious single best next-step; it's most worth it when the *cost of committing to the wrong branch* is high relative to the *cost of exploring several*.

A lighter-weight version many production systems use instead of full tree search: generate 2-3 candidate plans (not full reasoning trees), have a critic step pick the best one, and only fall back to deeper search if the chosen plan fails during execution. This captures most of ToT's robustness benefit at a fraction of its cost.`,
    bodyZh: `无论是 ReAct 还是简单的先规划后执行，一次只沿着一条推理路径走下去——如果第 2 步选择的方案最终是个死胡同，智能体通常要等到已经花费了 token 和工具调用去尝试之后，才会发现这一点。

**思维树（Tree of Thoughts，ToT）**，出自 Yao 等人（2023）的论文，把规划重新定义为一个搜索问题：在每一个决策点，生成*多个*候选的下一步方案（而不是只生成一个），对每个候选方案进行评估（可以由模型自身、一个启发式函数，或一个外部检验来完成），并展开其中最有希望的方案——把广度优先或深度优先搜索这类经典搜索算法，应用到一棵由"推理状态"构成的树上，而不是游戏中的走法状态空间。

这在存在死胡同或需要回溯的任务上（谜题、某些规划问题、存在多种可行思路的代码任务）能带来实实在在的鲁棒性提升，但代价也是实实在在的：在每一个分支都生成并评估多个候选方案，会让 token 消耗按你所探索的分支数量成倍增长，往往是相当大的倍数。对于那些存在明显唯一最优下一步的任务，这样做很少值得；而当"选错分支的代价"相对"探索多个分支的代价"而言很高时，它才最值得采用。

许多生产系统采用的是比完整树搜索更轻量的版本：只生成 2—3 个候选计划（而非完整的推理树），用一个评审步骤挑出最佳方案，只有在所选计划在执行过程中失败时，才回退到更深层次的搜索。这样能以远低于 ToT 的成本，捕获它大部分的鲁棒性收益。`,
    learningMapEn: `- Understand ToT's reframing of planning as tree search
- Learn the generate-multiple/evaluate/expand loop
- Weigh ToT's robustness gain against its multiplicative cost
- Learn the lightweight "2-3 candidate plans + critic" alternative`,
    learningMapZh: `- 理解 ToT 把规划重新定义为树搜索的思路
- 掌握"生成多个 → 评估 → 展开"的循环
- 权衡 ToT 的鲁棒性收益与其成倍增长的成本
- 掌握"2—3 个候选计划 + 评审"的轻量替代方案`,
    handsOnEn: `1. Pick a task with a known dead-end risk and generate 3 candidate first-steps instead of 1.
2. Write an evaluator prompt that scores each candidate before committing.
3. Compare token cost of the 3-candidate approach vs. a single-path approach on the same task.
4. Decide, based on that cost, whether this task actually warrants tree search vs. a single best-guess path.`,
    handsOnZh: `1. 选一个已知存在死胡同风险的任务，生成 3 个候选的第一步方案，而不是只生成 1 个。
2. 写一个评估者 prompt，在最终采纳前为每个候选方案打分。
3. 对比"3 候选"方案与"单一路径"方案在同一任务上的 token 成本。
4. 基于该成本，判断这个任务是否真的值得用树搜索，还是用单一的最佳猜测路径即可。`,
    resources: [
      {
        title: "Tree of Thoughts: Deliberate Problem Solving with Large Language Models",
        url: "https://arxiv.org/abs/2305.10601",
        description: "The original paper — search-based planning with generate/evaluate/expand steps.",
      },
      {
        title: "Plan-and-Solve Prompting",
        url: "https://arxiv.org/abs/2305.04091",
        description: "A lighter-weight planning pattern to compare cost/benefit against full tree search.",
      },
    ],
  },
  {
    order: 23,
    key: "task-decomposition-strategies",
    titleEn: "Task Decomposition Strategies",
    titleZh: "任务拆解策略",
    category: "skill",
    summaryEn:
      "How you cut a big goal into sub-tasks determines whether planning actually reduces errors or just relocates them into badly-scoped steps.",
    summaryZh: "如何把一个大目标切分为子任务，决定了规划究竟是真正减少了错误，还是只是把错误转移到了划分不当的步骤中。",
    tags: ["agentic-ai", "planning", "task-decomposition", "deeplearningai"],
    bodyEn: `A plan is only as good as its decomposition. Common ways to break a goal into sub-tasks, each suited to different problem shapes:

- **Sequential decomposition.** Step N depends on step N-1's output (research → draft → edit). Simplest to reason about; fails hard if any single step blocks.
- **Parallel/independent decomposition.** Sub-tasks don't depend on each other (summarize 5 independent documents) — can run concurrently, and one sub-task's failure doesn't block the others.
- **Hierarchical decomposition.** A high-level step is itself broken into its own sub-plan only when execution reaches it — avoids over-planning detail for steps that may turn out unnecessary.
- **Goal-based (not action-based) sub-tasks.** Write sub-tasks as "have X" (a state to reach) rather than "do Y" (a specific action) — this leaves the executor room to pick the best tool/approach for reaching that state, rather than being locked into a plan-time guess.

A common decomposition mistake: steps that are too coarse to verify ("do the analysis") give the executor no way to know if it succeeded; steps that are too fine ("call function X with argument Y") lock in decisions the planner didn't have enough information to make well. Aim for sub-tasks with a checkable definition of done, phrased as an outcome, at the coarsest grain that's still independently verifiable.`,
    bodyZh: `一份计划的质量，取决于其拆解的质量。以下是把一个目标拆解为子任务的几种常见方式，各自适合不同的问题结构：

- **顺序式拆解（Sequential）。** 第 N 步依赖第 N-1 步的输出（调研 → 起草 → 编辑）。最容易推理，但只要有一步卡住，整个流程就会硬性中断。
- **并行/独立式拆解（Parallel）。** 子任务之间互不依赖（对 5 份独立文档分别做摘要）——可以并发执行，且某个子任务失败不会阻塞其他子任务。
- **层级式拆解（Hierarchical）。** 一个高层步骤，只有在执行推进到它时，才被进一步拆解为自己的子计划——避免为那些最终可能根本不需要的步骤过度提前规划细节。
- **基于目标（而非基于动作）的子任务。** 把子任务写成"达到状态 X"，而不是"执行动作 Y"——这为执行者保留了空间，让它可以自行选择达到该状态的最佳工具/方法，而不是被锁定在规划阶段做出的猜测中。

一个常见的拆解错误是：粒度过粗的步骤（"做分析"）让执行者无法判断自己是否成功；粒度过细的步骤（"用参数 Y 调用函数 X"）则把规划者在信息不足时做出的判断提前锁死了。目标应当是：子任务具备可核查的"完成定义"，以结果而非动作来表述，粒度尽可能粗，但仍要能够独立验证。`,
    learningMapEn: `- Learn 4 decomposition strategies: sequential, parallel, hierarchical, goal-based
- Understand why goal-based sub-tasks give the executor more freedom
- Recognize the too-coarse vs. too-fine decomposition failure modes
- Practice writing sub-tasks with a checkable "definition of done"`,
    learningMapZh: `- 掌握 4 种拆解策略：顺序式、并行式、层级式、基于目标
- 理解为何基于目标的子任务能给执行者更多自由
- 识别"过粗"与"过细"两种拆解失败模式
- 练习为子任务编写可核查的"完成定义"`,
    handsOnEn: `1. Take a goal and decompose it sequentially, then again as independent parallel sub-tasks where possible.
2. Rewrite one action-based sub-task ("call search API") as a goal-based one ("have the current price of X").
3. For each sub-task, write a one-line checkable definition of done.
4. Identify any sub-task that's too coarse to verify or too fine to leave room for the executor, and fix it.`,
    handsOnZh: `1. 选一个目标，先做顺序式拆解，再尽可能改为独立的并行子任务。
2. 把一个基于动作的子任务（"调用搜索 API"）改写为基于目标的子任务（"获得 X 的当前价格"）。
3. 为每个子任务写一句可核查的"完成定义"。
4. 找出任何粒度过粗（无法核查）或过细（未给执行者留出空间）的子任务，并加以修正。`,
    resources: [
      {
        title: "Plan-and-Solve Prompting",
        url: "https://arxiv.org/abs/2305.04091",
        description: "Discusses decomposition quality as the main lever on plan-and-execute performance.",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Practical guidance on task decomposition granularity for real agent workflows.",
      },
    ],
  },
  {
    order: 24,
    key: "handling-ambiguity",
    titleEn: "Handling Ambiguity and Underspecified Goals",
    titleZh: "处理模糊性与未充分说明的目标",
    category: "best-practices",
    summaryEn:
      "A plan built on a wrong guess about what the user actually wants fails regardless of how well every subsequent step is executed — clarifying is often the highest-value first action.",
    summaryZh: "如果计划建立在对用户真实意图的错误猜测之上，无论后续每一步执行得多好，整个计划都会失败——澄清往往是价值最高的第一个动作。",
    tags: ["agentic-ai", "planning", "ambiguity", "best-practices"],
    bodyEn: `Real user requests are frequently underspecified: "summarize our Q3 numbers" doesn't say which numbers, for whom, at what length, or by when. An agent that plans confidently on top of an unstated assumption can execute flawlessly and still fail the user, because it solved the wrong problem.

Practical patterns for handling this:

- **Detect ambiguity before planning, not after acting.** Have the planning step explicitly check: "is there a reasonable default, or does this genuinely branch into different valid plans?" If it genuinely branches, that's a clarification point, not a coin flip.
- **Ask, don't guess, when the cost of a wrong guess is high.** A wrong guess on a low-stakes formatting choice is cheap to fix later; a wrong guess on which system to modify or which dataset to analyze can waste an entire task's budget.
- **State assumptions explicitly when you do proceed without asking.** "I'm assuming 'our Q3 numbers' means the finance team's revenue dashboard, not the sales team's pipeline numbers — let me know if that's wrong" turns a silent guess into a checkable one the user can correct in one message instead of debugging blind.
- **Distinguish clarifying questions from stalling.** A good agent asks *one* well-targeted question when genuinely blocked, not a checklist of ten before starting — over-asking is its own failure mode, especially for tasks where a reasonable default clearly exists.

The design principle underneath all of this: uncertainty about the *goal* should be resolved before spending budget on a *plan* — cheap to fix upfront, expensive to discover after the fact.`,
    bodyZh: `真实的用户请求常常说明不够充分："总结一下我们 Q3 的数据"，并没有说明是哪些数据、给谁看、多长篇幅、或什么时候要。一个在未言明的假设之上自信地制定计划的智能体，即便执行得完美无缺，也可能依然让用户不满意，因为它解决的是一个错误的问题。

处理这种情况的实用模式：

- **在规划之前而非行动之后检测模糊性。** 让规划步骤显式检查："是否存在一个合理的默认值，还是这确实会分叉出多个都有效的不同计划？" 如果确实会分叉，那就是一个应当澄清的点，而不是随便猜一个。
- **当猜错的代价很高时，应提问而非猜测。** 在一个低风险的格式选择上猜错，事后修正代价很低；但在"应修改哪个系统"或"应分析哪个数据集"上猜错，可能会浪费整个任务的预算。
- **如果确实选择不提问就继续，要明确说出自己的假设。** "我假设『我们 Q3 的数据』指的是财务团队的营收看板，而不是销售团队的 pipeline 数据——如果不对请告诉我"，这把一个悄无声息的猜测，变成了用户只需一句话就能纠正的可核查假设，而不是让用户去盲目排查问题。
- **区分澄清性提问与拖延。** 一个好的智能体在真正被卡住时，会问*一个*精准命中要害的问题，而不是在开始之前先抛出十个问题的清单——过度提问本身也是一种失败模式，尤其是在明显存在合理默认值的任务中。

贯穿这一切的设计原则是：关于*目标*的不确定性，应当在为*计划*投入预算之前就得到解决——事先解决成本很低，事后才发现则代价高昂。`,
    learningMapEn: `- Learn to detect genuine ambiguity vs. a safe-default case before planning
- Weigh "ask" vs. "guess and state the assumption" by cost of being wrong
- Avoid the over-asking failure mode — one targeted question, not a checklist
- Internalize resolving goal uncertainty before spending plan/execution budget`,
    learningMapZh: `- 学会在规划前区分"真正的模糊"与"可用安全默认值的情形"
- 依据"猜错的代价"权衡"提问"与"猜测并声明假设"
- 避免"过度提问"这一失败模式——问一个精准的问题，而非一份清单
- 内化"先解决目标不确定性，再投入规划/执行预算"这一原则`,
    handsOnEn: `1. Take an underspecified request you've received and list every reasonable interpretation.
2. Decide, for each interpretation gap, whether a safe default exists or clarification is needed.
3. Write one well-targeted clarifying question for the genuinely ambiguous case.
4. Write an "assumption statement" version instead, and compare which fits the task's stakes better.`,
    handsOnZh: `1. 找一个你收到过的说明不充分的请求，列出所有合理的理解方式。
2. 针对每一种理解差异，判断是否存在安全默认值，还是需要澄清。
3. 为真正存在歧义的情形，写一个精准命中要害的澄清问题。
4. 再写一个"声明假设"版本作为替代，比较哪种方式更适合该任务的风险高低。`,
    resources: [
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Notes on when an agent should stop and ask versus proceed with a stated assumption.",
      },
      {
        title: "Agentic AI — DeepLearning.AI",
        url: "https://www.deeplearning.ai/courses/agentic-ai",
        description: "Frames deconstructing an underspecified business process as a core agent-building skill.",
      },
    ],
  },
  {
    order: 25,
    key: "re-planning",
    titleEn: "Re-Planning When Reality Doesn't Match the Plan",
    titleZh: "当现实与计划不符时：重新规划",
    category: "skill",
    summaryEn:
      "Every plan is a bet on what execution will find — re-planning is the mechanism that lets an agent update that bet instead of executing a plan it already knows is wrong.",
    summaryZh: "每一份计划都是对执行过程中会发现什么的一次押注——重新规划正是让智能体能够更新这一押注、而不是继续执行一个它已经知道是错误的计划的机制。",
    tags: ["agentic-ai", "planning", "re-planning", "deeplearningai"],
    bodyEn: `A plan made before execution starts is necessarily a guess — it can't know what step 2 will actually find until step 2 runs. Re-planning is what keeps a plan-and-execute agent (page 21) from blindly finishing a plan that its own execution has already disproven.

Concrete triggers worth checking for after every step, not just when something obviously breaks:

- **A step's result contradicts an assumption the plan depended on.** The plan assumed the customer had one account; step 2 finds three — steps 3+ likely need to change.
- **A step fails outright** (after retries are exhausted — see the error-handling page) — the remaining plan may no longer make sense as written.
- **New information surfaces that changes the goal itself**, not just the path to it — the user's actual need turns out to be different from what was originally understood.
- **A step succeeds, but the result suggests a better remaining path exists** — not a failure, but an opportunity the original plan didn't anticipate.

The implementation pattern: after each step, run a lightweight check — "does anything about this result change the rest of the plan?" — cheap enough to run every time (unlike a full re-plan), escalating to a full re-planning call only when the check flags something. Skipping this check entirely is the single most common reason plan-and-execute agents complete tasks "successfully" by the letter of a stale plan while missing what the user actually needed.`,
    bodyZh: `执行开始前制定的计划，本质上必然是一种猜测——在第 2 步真正运行之前，它无法知道第 2 步实际会发现什么。重新规划正是防止一个先规划后执行的智能体（第 21 页）盲目执行一份已被自己的执行过程证伪的计划的机制。

以下是每一步之后都值得检查的具体触发条件，而不仅仅是在明显出错时才检查：

- **某一步的结果与计划所依赖的假设相矛盾。** 计划假设客户只有一个账户；第 2 步却发现有三个——第 3 步及之后的步骤很可能需要调整。
- **某一步彻底失败**（在重试预算耗尽之后——见错误处理一页）——按原样继续执行剩余计划可能已经没有意义。
- **出现了改变目标本身、而不只是改变实现路径的新信息**——用户真正的需求，其实与最初理解的不同。
- **某一步成功了，但其结果提示存在一条更好的后续路径**——这不是失败，而是原计划未曾预料到的机会。

具体的实现模式是：在每一步之后，运行一次轻量级检查——"这个结果是否改变了计划剩余部分的任何内容？"——这一检查成本足够低，可以每次都运行（不同于完整的重新规划），只有当检查发现异常时，才升级为一次完整的重新规划调用。完全跳过这一检查，是先规划后执行型智能体"按字面完成任务"、却按一份过时计划的字面要求完成、从而错过用户真正需求的最常见原因。`,
    learningMapEn: `- Understand that every plan is a guess subject to revision
- Learn 4 concrete re-planning triggers to check after each step
- Implement the cheap "does this change the plan?" check vs. full re-planning
- Recognize skipped re-planning as a leading cause of technically-complete-but-wrong task outcomes`,
    learningMapZh: `- 理解每一份计划本质上都是一个有待修正的猜测
- 掌握每一步之后应检查的 4 个具体重新规划触发条件
- 实现廉价的"这是否改变了计划？"检查，区别于完整重新规划
- 认识到跳过重新规划是"技术上完成但结果错误"这类任务失败的主要原因`,
    handsOnEn: `1. Add a lightweight post-step check to a plan-and-execute agent: "does this result contradict a plan assumption?"
2. Simulate a step returning an unexpected result and confirm the check fires.
3. Wire the check to trigger a full re-planning call only when it flags something.
4. Run the same task twice — once with re-planning disabled — and compare final outcomes.`,
    handsOnZh: `1. 为一个先规划后执行的智能体加入一次轻量级的步骤后检查："该结果是否与某个计划假设相矛盾？"
2. 模拟某一步返回一个意外结果，确认该检查会被触发。
3. 让该检查仅在发现异常时才触发一次完整的重新规划调用。
4. 对同一个任务运行两次——一次关闭重新规划——并比较最终结果的差异。`,
    resources: [
      {
        title: "Plan-and-Solve Prompting",
        url: "https://arxiv.org/abs/2305.04091",
        description: "Discusses plan revision as execution proceeds, not just single-pass planning.",
      },
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "Graph-based control flow makes conditional re-planning edges an explicit, inspectable part of the design.",
      },
    ],
  },
];
