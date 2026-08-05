import type { SeedPage } from "./types";

// Module 1 — Reflection (5 pages, order 7-11). First of Andrew Ng's four
// agentic design patterns.
export const module01Reflection: SeedPage[] = [
  {
    order: 7,
    key: "reflection-pattern",
    titleEn: "The Reflection Pattern: Letting an Agent Critique Itself",
    titleZh: "反思模式：让智能体自我批评",
    category: "skill",
    summaryEn:
      "Reflection asks the model to generate an output, then critique that output as if reviewing someone else's work, then revise — often the cheapest quality upgrade available.",
    summaryZh: "反思模式让模型先生成一个输出，然后像审阅别人的作品一样批评这个输出，再进行修订——这往往是成本最低的质量提升手段。",
    tags: ["agentic-ai", "reflection", "design-patterns", "deeplearningai"],
    bodyEn: `Reflection is the simplest of the four patterns to implement and frequently the highest-leverage one to add first. The core idea: instead of accepting an LLM's first draft as final, run a second pass where the model reviews its own output against explicit criteria, then produces a revision.

A minimal implementation is two prompts:

1. **Generate**: "Write [X]."
2. **Critique + Revise**: "Here is a draft of [X]: [draft]. Review it for [specific criteria — correctness, completeness, tone, edge cases]. List concrete problems, then rewrite the draft to fix them."

The critique step matters more than it looks — a model asked to "just improve this" tends to make cosmetic edits. A model asked to *list specific problems first* engages more critically, closer to how a human editor works. Reflection compounds: some implementations loop generate→critique→revise 2-3 times, stopping when the critique step finds no more issues or a step budget is hit.

Reflection is not free — it roughly doubles (or more) the token cost and latency of a single generation. It pays off most on tasks where correctness matters and errors are expensive to catch later: code generation, structured data extraction, anything with a checkable format.`,
    bodyZh: `反思是四种模式中实现起来最简单的一种，也常常是最值得优先加入的高杠杆手段。核心思路是：不要把 LLM 的初稿直接当作最终结果，而是再跑一轮，让模型依据明确的标准审视自己的输出，然后生成修订版。

一个最简实现只需要两个 prompt：

1. **生成（Generate）**："写出 [X]。"
2. **批评 + 修订（Critique + Revise）**："这是 [X] 的一份草稿：[草稿内容]。请依据 [具体标准——正确性、完整性、语气、边界情况] 对其进行审阅。先列出具体问题，然后重写草稿以修正这些问题。"

"批评"这一步比看起来更重要——如果只是让模型"改进一下"，它往往只会做表面的修饰性改动。而要求模型*先列出具体问题*，会促使它更批判性地介入，更接近人类编辑的工作方式。反思是可以叠加的：一些实现会循环执行"生成→批评→修订" 2—3 次，直到批评步骤找不到更多问题，或达到步数预算上限。

反思并非没有代价——它大致会把单次生成的 token 成本和延迟翻倍（甚至更多）。它在那些正确性很重要、且事后发现错误代价高昂的任务上回报最大：代码生成、结构化数据抽取，以及任何有可核查格式的任务。`,
    learningMapEn: `- Implement the minimal two-prompt reflection loop
- Understand why "list problems first" beats "just improve this"
- Weigh the cost/latency trade-off against error-catching value
- Identify tasks in your own work where reflection pays off most`,
    learningMapZh: `- 实现最简的两段式反思循环
- 理解为何"先列出问题"比"直接改进"更有效
- 权衡成本/延迟代价与纠错价值
- 找出你自己工作中反思模式回报最大的任务`,
    handsOnEn: `1. Take any generation task and write a critique prompt with 3+ explicit criteria.
2. Run generate → critique → revise once and compare draft vs. revision.
3. Measure the extra tokens/latency the reflection pass cost.
4. Decide, based on that cost, whether a second reflection pass is worth it for this task.`,
    handsOnZh: `1. 选一个生成任务，写一个包含 3 条以上明确标准的批评 prompt。
2. 运行一次"生成 → 批评 → 修订"，对比初稿与修订版。
3. 测量这次反思额外消耗的 token 数和延迟。
4. 基于这一成本，判断对该任务是否值得再跑第二轮反思。`,
    resources: [
      {
        title: "Andrew Ng on Reflection (The Batch)",
        url: "https://x.com/AndrewYNg/status/1773393357022298617",
        description: "Ng's original write-up of Reflection as the first of the four agentic design patterns.",
      },
      {
        title: "Self-Refine: Iterative Refinement with Self-Feedback",
        url: "https://arxiv.org/abs/2303.17651",
        description: "Academic formalization of the generate-critique-revise loop, with benchmark results.",
      },
    ],
  },
  {
    order: 8,
    key: "self-critique-prompting",
    titleEn: "Self-Critique Prompting Techniques",
    titleZh: "自我批评的 Prompt 技巧",
    category: "skill",
    summaryEn:
      "How you ask a model to critique itself determines whether reflection actually catches errors or just produces confident-sounding restatements.",
    summaryZh: "如何要求模型进行自我批评，决定了反思环节究竟能真正发现错误，还是只是生成一遍听起来更自信的复述。",
    tags: ["agentic-ai", "reflection", "prompt-engineering", "deeplearningai"],
    bodyEn: `Not all critique prompts are equally effective. A few techniques consistently produce sharper self-critique:

- **Role reframing.** "You are a strict code reviewer who has caught major bugs in this exact style of code before" outperforms "review this code" — it primes a more adversarial stance.
- **Checklist critique.** Give the model an explicit rubric (correctness / edge cases / style / security) rather than an open-ended "any issues?" — models are much better at evaluating against a named criterion than free-associating problems.
- **Ask for evidence, not verdicts.** "Quote the exact line that's wrong and explain why" produces more grounded critique than "is this correct? yes/no."
- **Separate critique from revision.** Generating the critique and the revision in the same call tends to produce softer critique (the model "knows" it's about to fix things and under-reports). Two separate calls — critique first, revision second, without letting the model see its own revision plan while critiquing — surfaces more issues.
- **Second opinion via a different model or temperature.** Even a cheap, smaller model asked only to critique (not generate) can catch errors the generating model was blind to, precisely because it didn't produce the flawed reasoning in the first place.

The common failure mode to watch for: a model that's asked to critique its own confident-sounding output tends toward agreement ("this looks good") unless the prompt actively works against that bias.`,
    bodyZh: `并非所有批评类 prompt 的效果都一样。以下几种技巧能稳定地产生更犀利的自我批评：

- **角色重塑（Role reframing）。** "你是一位严格的代码审查者，曾经在这种风格的代码中发现过重大 bug"，比单纯的"审查这段代码"效果更好——它会激发更具对抗性的立场。
- **清单式批评（Checklist critique）。** 给模型一份明确的评分标准（正确性 / 边界情况 / 代码风格 / 安全性），而不是开放式的"有什么问题吗？"——模型在依据一个明确命名的标准进行评估时，表现要远好于自由联想问题。
- **要求提供证据，而非直接下结论。** "引用出错的具体那一行，并解释原因"，比"这段对不对？是/否"能产生更有依据的批评。
- **将批评与修订分开进行。** 在同一次调用中同时生成批评和修订，往往会产生更"温和"的批评（模型"知道"自己马上要去修正，于是少报问题）。分两次独立调用——先批评、再修订，且批评时不让模型预先看到自己的修订方案——能发现更多问题。
- **借助另一个模型或不同 temperature 获取"第二意见"。** 即便是一个只负责批评（不负责生成）的更小、更便宜的模型，也可能发现生成模型自身发现不了的错误——恰恰因为它一开始就没有产生那个有缺陷的推理过程。

需要警惕的常见失败模式是：如果只是让模型批评自己那听起来很自信的输出，它往往会倾向于附和（"这看起来不错"），除非 prompt 主动对抗这种偏向。`,
    learningMapEn: `- Learn 5 concrete techniques: role reframing, checklists, evidence-first, separated calls, second-opinion models
- Understand why same-call critique+revision under-reports issues
- Recognize the "agreement bias" failure mode
- Practice rewriting a weak critique prompt into a strong one`,
    learningMapZh: `- 掌握 5 种具体技巧：角色重塑、清单式、证据优先、分离调用、第二意见模型
- 理解为何同一次调用中的批评+修订会少报问题
- 识别"附和偏向"这一失败模式
- 练习把一个薄弱的批评 prompt 改写为更强的版本`,
    handsOnEn: `1. Write a weak critique prompt ("any issues with this?") and run it once.
2. Rewrite it using role reframing + checklist + evidence-first, and run it on the same draft.
3. Compare how many concrete, actionable issues each version surfaced.
4. Try routing the critique step to a smaller/cheaper model and compare quality vs. cost.`,
    handsOnZh: `1. 写一个薄弱的批评 prompt（"这有什么问题吗？"），运行一次。
2. 用角色重塑 + 清单式 + 证据优先的方式重写，并在同一份草稿上运行。
3. 对比两个版本各自发现了多少条具体、可执行的问题。
4. 尝试把批评步骤路由给一个更小/更便宜的模型，对比质量与成本。`,
    resources: [
      {
        title: "Self-Refine: Iterative Refinement with Self-Feedback",
        url: "https://arxiv.org/abs/2303.17651",
        description: "Ablations on feedback specificity and its effect on revision quality.",
      },
      {
        title: "Constitutional AI: Harmlessness from AI Feedback",
        url: "https://arxiv.org/abs/2212.08073",
        description: "A related use of model self-critique against an explicit rubric, applied to safety.",
      },
    ],
  },
  {
    order: 9,
    key: "reflexion-verbal-feedback",
    titleEn: "Reflexion: Learning from Verbal Feedback Across Attempts",
    titleZh: "Reflexion：跨尝试的言语反馈学习",
    category: "knowledge",
    summaryEn:
      "Reflexion extends single-pass reflection into a memory of past failures, written in natural language and carried forward across multiple attempts at a task.",
    summaryZh: "Reflexion 把单次反思扩展为一份对过往失败的记忆，用自然语言写成，并在多次任务尝试之间延续下去。",
    tags: ["agentic-ai", "reflection", "reflexion", "deeplearningai"],
    bodyEn: `The Reflexion paper (Shinn et al., 2023) formalized a version of reflection built for tasks with multiple attempts — coding problems with test suites, games, multi-step planning tasks — where the agent gets to try again after failing.

The loop: attempt the task → get an outcome signal (test failure, wrong answer, environment feedback) → generate a **verbal reflection** on why the attempt failed and what to do differently → store that reflection in a memory buffer → retry the task with the reflection included in context. Unlike fine-tuning, nothing about the model's weights changes; the "learning" lives entirely in accumulated natural-language notes-to-self.

This matters for two reasons. First, it's a working alternative to reinforcement learning for improving task performance without any gradient updates — useful when you can't or don't want to fine-tune. Second, it reframes what "memory" means for an agent: not just facts retrieved from a database, but a running record of *why past attempts failed*, which is exactly the kind of context that improves the next attempt the most.

The practical version most teams build is lighter than the full paper: after any agent failure, write one paragraph — "what was tried, what went wrong, what to avoid next time" — and prepend it to the next attempt's context. Even that alone measurably reduces repeat mistakes on retryable tasks.`,
    bodyZh: `Reflexion 论文（Shinn 等，2023）将反思模式的一个版本形式化，专门用于可以多次尝试的任务——带测试套件的编程题、游戏、多步骤规划任务——即智能体在失败后可以再次尝试。

其循环为：尝试任务 → 获得结果信号（测试失败、答案错误、环境反馈）→ 生成一段关于"为什么这次尝试失败了、下次该怎么做"的**言语反思**→ 将该反思存入一个记忆缓冲区 → 在下一次尝试时，把该反思带入上下文再次尝试。与微调不同，模型权重没有任何变化；"学习"完全存在于不断积累的、写给自己的自然语言笔记中。

这一点之所以重要，有两个原因。第一，它是强化学习之外一种切实可行的替代方案，可以在不进行任何梯度更新的情况下提升任务表现——当你无法或不想微调模型时尤为有用。第二，它重新定义了智能体"记忆"的含义：不仅仅是从数据库中检索出的事实，更是一份持续记录*过往尝试为何失败*的记录——而这恰恰是对下一次尝试帮助最大的一类上下文。

大多数团队实际构建的版本，比论文中的完整实现要轻量得多：智能体每次失败后，写一段话——"尝试了什么、哪里出了问题、下次要避免什么"——并把它放在下一次尝试的上下文最前面。仅这一点，就能在可重试的任务上明显减少重复犯错。`,
    learningMapEn: `- Understand the attempt → outcome → verbal reflection → retry loop
- See why this is a lightweight alternative to fine-tuning/RL
- Redefine "memory" as including a record of past failures, not just facts
- Learn the lightweight one-paragraph version most teams actually ship`,
    learningMapZh: `- 理解"尝试 → 结果 → 言语反思 → 重试"循环
- 认识到这是微调/强化学习之外的一种轻量替代方案
- 重新理解"记忆"应包含过往失败记录，而不仅是事实
- 掌握大多数团队实际落地的轻量单段式版本`,
    handsOnEn: `1. Take a task your agent has failed at before (or simulate one).
2. Write a one-paragraph verbal reflection: what was tried, what went wrong, what to avoid.
3. Prepend that reflection to the next attempt's prompt and re-run.
4. Track whether the same category of mistake recurs across 3 retries.`,
    handsOnZh: `1. 找一个你的智能体之前失败过的任务（或模拟一个）。
2. 写一段言语反思：尝试了什么、哪里出了问题、下次要避免什么。
3. 把该反思加到下一次尝试的 prompt 最前面，重新运行。
4. 追踪同一类错误是否在 3 次重试中反复出现。`,
    resources: [
      {
        title: "Reflexion: Language Agents with Verbal Reinforcement Learning",
        url: "https://arxiv.org/abs/2303.11366",
        description: "The original paper — attempt/outcome/reflection loop with benchmark results on coding and decision-making tasks.",
      },
      {
        title: "Self-Refine: Iterative Refinement with Self-Feedback",
        url: "https://arxiv.org/abs/2303.17651",
        description: "A closely related single-pass version of the same underlying idea.",
      },
    ],
  },
  {
    order: 10,
    key: "reflection-external-verifiers",
    titleEn: "Reflection with External Verifiers (Tests, Linters, Critics)",
    titleZh: "借助外部验证器的反思（测试、Linter、评审器）",
    category: "skill",
    summaryEn:
      "Model self-critique is opinion; a test suite, linter, or schema validator is fact — combining both makes reflection dramatically more reliable.",
    summaryZh: "模型的自我批评是「意见」；测试套件、linter 或 schema 校验器是「事实」——将两者结合，能让反思模式的可靠性大幅提升。",
    tags: ["agentic-ai", "reflection", "verification", "deeplearningai"],
    bodyEn: `Pure model self-critique has a ceiling: a model can be confidently wrong about its own output in exactly the way it was confidently wrong the first time. The fix is to feed the critique step **objective, external** signal wherever one exists, rather than relying solely on the model's opinion of itself:

- **Code**: run the test suite, a linter, a type checker. Feed the actual error output back into the reflection prompt, not a paraphrase.
- **Structured output**: validate against a JSON Schema / Pydantic model. A schema violation is unambiguous — no need for the model to "notice" it.
- **Factual claims**: cross-check against a retrieval step or a search tool, rather than asking the model to fact-check itself from memory.
- **Numeric/logical tasks**: recompute with actual code execution rather than trusting the model's arithmetic.

The general pattern — generate, verify with a deterministic tool, feed the verifier's exact output back as the critique, revise, repeat until the verifier passes or a retry budget is spent — is one of the most reliable loops in agentic systems precisely because it removes the model from judging its own work wherever a ground-truth check exists. Reserve model-based critique (module 7) for the parts of the task that genuinely have no deterministic check: tone, clarity, subjective quality.`,
    bodyZh: `纯粹依靠模型自我批评是有天花板的：模型完全可能以第一次犯错时同样的方式，自信满满地对自己的输出得出错误结论。解决办法是：只要存在**客观、外部**的信号，就把它输入到批评环节，而不是单纯依赖模型对自身的评判：

- **代码**：运行测试套件、linter、类型检查器。把真实的错误输出反馈进反思 prompt，而不是给出一段转述。
- **结构化输出**：用 JSON Schema / Pydantic 模型进行校验。schema 违规是明确无歧义的——不需要模型自己"察觉"。
- **事实性声明**：借助检索步骤或搜索工具进行交叉核对，而不是让模型仅凭"记忆"自行核实事实。
- **数值/逻辑类任务**：用真实的代码执行重新计算，而不是相信模型的算术能力。

这一通用模式——生成、用确定性工具验证、把验证器的确切输出反馈作为批评内容、修订、重复直到验证通过或用尽重试预算——是智能体系统中最可靠的循环之一，原因正在于：只要存在可核验的确凿标准，就不再让模型来评判自己的工作。把基于模型的批评（见第 7 页）留给那些确实没有确定性检验手段的部分：语气、清晰度、主观质量。`,
    learningMapEn: `- Distinguish model opinion from external, deterministic signal
- List verifier types: tests, linters, schema validators, retrieval fact-checks, code execution
- Learn the generate → verify → feed-back → revise loop
- Know when to fall back to model-based critique (no ground truth exists)`,
    learningMapZh: `- 区分模型意见与外部确定性信号
- 列举验证器类型：测试、linter、schema 校验器、检索式事实核查、代码执行
- 掌握"生成 → 验证 → 反馈 → 修订"循环
- 明确何时应退回到基于模型的批评（不存在客观标准时）`,
    handsOnEn: `1. Pick a code-generation task and wire its real test output into the reflection prompt.
2. Add schema validation to a structured-output task and feed the exact validation error back on failure.
3. Set a retry budget (e.g. 3 attempts) and log how often the verifier passes by attempt N.
4. Identify one part of your task that has no deterministic check, and note it as model-critique-only.`,
    handsOnZh: `1. 选一个代码生成任务，把真实的测试输出接入反思 prompt。
2. 为一个结构化输出任务加上 schema 校验，失败时把确切的校验错误反馈回去。
3. 设定一个重试预算（例如 3 次），并记录验证器在第 N 次尝试时的通过率。
4. 找出任务中没有确定性检验手段的部分，标记为"仅依赖模型批评"。`,
    resources: [
      {
        title: "ReAct: Synergizing Reasoning and Acting in Language Models",
        url: "https://arxiv.org/abs/2210.03629",
        description: "Interleaves actions (including verification-style observations) with reasoning traces.",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Notes on grounding agent feedback loops in real environment signal rather than self-assessment.",
      },
    ],
  },
  {
    order: 11,
    key: "when-reflection-helps",
    titleEn: "When Reflection Helps and When It Just Burns Tokens",
    titleZh: "反思何时有用，何时只是白白消耗 token",
    category: "best-practices",
    summaryEn:
      "Reflection isn't free, and it doesn't help uniformly — knowing when to skip it is as important as knowing how to implement it.",
    summaryZh: "反思并非没有代价，其效果也并非在所有场景下都一样——知道何时该跳过它，与知道如何实现它同样重要。",
    tags: ["agentic-ai", "reflection", "best-practices", "deeplearningai"],
    bodyEn: `Reflection roughly doubles cost and latency for a task, so it should be a deliberate choice, not a default. A few rules of thumb for deciding whether it's worth adding:

**Add reflection when:**
- The task has a checkable structure (code, schema-validated output, math) — reflection paired with a verifier (module 10) has a very high hit rate here.
- Errors are expensive to catch downstream — a wrong number in a financial report costs far more to fix after the fact than the extra reflection pass costs upfront.
- The first-draft failure mode is *specific and nameable* — "forgets edge cases," "hallucinates citations," "misreads units" — reflection prompts work best when you can name what to look for.

**Skip or limit reflection when:**
- The task is short, low-stakes, and easily re-run by a human if wrong (a chat reply, a quick summary).
- You've measured that reflection isn't actually changing the output — some tasks hit a quality ceiling on attempt 1 that a second pass doesn't move; measure before assuming it helps.
- Latency is the binding constraint (a real-time voice agent, for example) — a doubled response time may cost more in user experience than the quality gain is worth.

The discipline that matters most: **measure, don't assume**. Run the same eval set with and without reflection and look at the actual delta in accuracy/quality per extra dollar spent, rather than treating reflection as an unconditionally good addition.`,
    bodyZh: `反思大致会让一个任务的成本和延迟翻倍，因此它应当是一个经过深思熟虑的选择，而不是默认项。以下是判断是否值得加入反思的一些经验法则：

**应当加入反思的情形：**
- 任务具有可核查的结构（代码、经 schema 校验的输出、数学计算）——反思配合验证器（见第 10 页）在这类场景下命中率非常高。
- 错误在下游被发现的代价高昂——财务报表中一个错误的数字，事后修正的成本远高于事先多做一次反思的成本。
- 初稿的失败模式是*具体且可命名*的——"遗漏边界情况"、"编造引用"、"看错单位"——当你能明确说出该检查什么时，反思类 prompt 效果最好。

**应当跳过或限制反思的情形：**
- 任务简短、风险低，且如果出错，人类可以轻松地重新执行（一条聊天回复、一份快速摘要）。
- 你已经测量过，反思实际上并没有改变输出结果——有些任务在第一次尝试时就已达到质量天花板，第二轮并不会带来提升；在假设它有用之前，先去测量。
- 延迟是硬性约束（例如实时语音智能体）——响应时间翻倍在用户体验上付出的代价，可能超过质量提升所带来的价值。

最重要的原则是：**先测量，再假设**。在同一份评测集上分别跑"有反思"和"无反思"两种情况，看每多花一美元实际带来的准确率/质量提升幅度，而不是把反思当作一种无条件有益的附加项。`,
    learningMapEn: `- Learn the "add reflection when" checklist: checkable structure, expensive errors, nameable failure mode
- Learn the "skip reflection when" checklist: low stakes, no measured delta, latency-bound
- Internalize "measure, don't assume" as the governing discipline
- Practice running an A/B eval of reflection on a real task`,
    learningMapZh: `- 掌握"应加入反思"清单：可核查结构、错误代价高、失败模式可命名
- 掌握"应跳过反思"清单：低风险、无实测提升、受延迟约束
- 内化"先测量，再假设"这一核心原则
- 练习在真实任务上对反思做 A/B 评测`,
    handsOnEn: `1. Pick a task and classify it against the "add" vs "skip" checklists above.
2. Run an eval set with reflection off, record accuracy/quality and cost.
3. Run the same eval set with reflection on, record the same metrics.
4. Compute the quality delta per extra dollar spent, and decide whether to keep reflection on by default.`,
    handsOnZh: `1. 选一个任务，依据上面的"加入"与"跳过"清单进行分类。
2. 在关闭反思的情况下运行一份评测集，记录准确率/质量与成本。
3. 在开启反思的情况下运行同一份评测集，记录相同指标。
4. 计算每多花一美元带来的质量提升幅度，并决定是否默认开启反思。`,
    resources: [
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Cost/complexity trade-off guidance that applies directly to deciding when to add reflection.",
      },
      {
        title: "Self-Refine: Iterative Refinement with Self-Feedback",
        url: "https://arxiv.org/abs/2303.17651",
        description: "Reports task types where iterative self-refinement helps most and least in its own benchmarks.",
      },
    ],
  },
];
