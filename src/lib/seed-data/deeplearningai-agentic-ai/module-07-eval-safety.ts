import type { SeedPage } from "./types";

// Module 7 — Evaluation, Safety & Production (6 pages, order 43-48). Closes
// the curriculum: how to know an agent works, and how to run it responsibly.
export const module07EvalSafety: SeedPage[] = [
  {
    order: 43,
    key: "evaluating-agent-performance",
    titleEn: "Evaluating Agent Performance: Metrics That Matter",
    titleZh: "评估智能体表现：真正重要的指标",
    category: "ai-evaluation",
    summaryEn:
      "A single \"accuracy\" number rarely captures whether an agent is actually good — trajectory quality, efficiency, and safety each need their own metrics.",
    summaryZh: "单一的「准确率」数字很少能真正反映一个智能体是否足够好——轨迹质量、效率与安全性，各自都需要专门的度量指标。",
    tags: ["agentic-ai", "evaluation", "metrics", "deeplearningai"],
    bodyEn: `Because agents act over trajectories (module 0, page 2), not single turns, evaluating them needs more dimensions than a chatbot's "was this reply good":

- **Task success rate.** Did the agent actually achieve the stated goal, per an explicit, checkable definition of done (module 3, page 23) — not "did it produce a plausible-looking answer."
- **Trajectory quality, independent of final outcome.** Did it take a reasonable path, or stumble into a correct answer via wasteful, risky, or lucky steps? A system that reaches the right answer 90% of the time via bad paths is a different (worse) system than one reaching it 90% of the time via good ones, even at equal final-success rates.
- **Efficiency.** Steps taken, tool calls made, tokens spent, wall-clock time — per successful task, since a "successful" agent that takes 40 steps to do what should take 5 has a real cost problem even if its accuracy looks fine.
- **Tool-use correctness.** Specifically: how often did it call the *right* tool with the *right* arguments (module 2, page 14's routing-accuracy metric) — this is often where the actual errors live, distinct from the final-answer accuracy number.
- **Safety/guardrail adherence.** Did it stay within whatever constraints were defined (module 7, page 45) — a metric that matters even when the task otherwise succeeded, since a successful-but-unsafe trajectory is a real failure by a different name.

The practical takeaway: build a small dashboard across these dimensions rather than optimizing a single blended score — a system that's 95% accurate but takes 3x longer than necessary, or is accurate but tool-selection-sloppy, needs different fixes than the raw accuracy number would suggest.`,
    bodyZh: `由于智能体是在轨迹（第 0 模块第 2 页）上行动的，而非单轮对话，评估它们需要比聊天机器人"这条回复好不好"更多的维度：

- **任务成功率。** 智能体是否真正达成了既定目标，依据一个明确、可核查的"完成定义"（第 3 模块第 23 页）——而不是"是否给出了一个看起来可信的答案"。
- **独立于最终结果的轨迹质量。** 它走的路径是否合理，还是通过浪费资源、冒险或运气好而误打误撞得出了正确答案？一个 90% 的时间通过糟糕路径得出正确答案的系统，与一个 90% 的时间通过良好路径得出正确答案的系统，即便最终成功率相同，也是（更差的）不同系统。
- **效率。** 每次成功任务所花费的步数、工具调用次数、消耗的 token、墙钟时间——一个"成功"的智能体，如果本应 5 步就能完成的事却用了 40 步，即便准确率看起来没问题，也存在实实在在的成本问题。
- **工具使用正确性。** 具体而言：它调用*正确*工具、使用*正确*参数的频率有多高（对应第 2 模块第 14 页的路由准确率指标）——真正的错误往往就藏在这里，与最终答案的准确率数字是不同的问题。
- **安全性/护栏遵守情况。** 它是否始终遵守了所定义的各项约束（第 7 模块第 45 页）——即便任务本身成功了，这一指标依然重要，因为一条"成功但不安全"的轨迹，本质上是换了个名字的真实失败。

实践上的结论是：围绕这些维度搭建一个小型仪表盘，而不是只优化一个混合成单一数值的分数——一个准确率 95%、但耗时是必要值 3 倍的系统，或者准确率高但工具选择草率的系统，所需要的修复方式，与单看准确率数字所暗示的会大不相同。`,
    learningMapEn: `- Learn 5 evaluation dimensions: task success, trajectory quality, efficiency, tool-use correctness, safety adherence
- Understand why a single blended accuracy score hides real problems
- See how trajectory quality can diverge from final-outcome success
- Build a small multi-dimensional eval dashboard instead of one number`,
    learningMapZh: `- 掌握 5 个评估维度：任务成功率、轨迹质量、效率、工具使用正确性、安全遵守情况
- 理解为何单一的混合准确率分数会掩盖真实问题
- 了解轨迹质量为何可能与最终结果的成功与否相背离
- 搭建一个多维度评估仪表盘，而不是只看一个数字`,
    handsOnEn: `1. Define a checkable "definition of done" for one of your agent's tasks.
2. Measure task success rate against that definition on a small eval set.
3. Add efficiency metrics (steps, tool calls, tokens) per successful task.
4. Separately measure tool-selection accuracy and compare it against the overall success rate.`,
    handsOnZh: `1. 为你智能体的某个任务定义一个可核查的"完成定义"。
2. 在一个小型评测集上，依据该定义测量任务成功率。
3. 为每个成功任务加入效率指标（步数、工具调用次数、token 数）。
4. 单独测量工具选择准确率，并将其与整体成功率进行对比。`,
    resources: [
      {
        title: "Agentic AI — DeepLearning.AI",
        url: "https://www.deeplearning.ai/courses/agentic-ai",
        description: "Emphasizes building testing frameworks and systematic error analysis as core agent-building skills.",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Discusses evaluating agents beyond a single success/failure signal.",
      },
    ],
  },
  {
    order: 44,
    key: "building-eval-harness",
    titleEn: "Building an Agent Eval Harness",
    titleZh: "构建智能体评测框架",
    category: "ai-evaluation",
    summaryEn:
      "An eval harness turns \"I think it's working better now\" into a number you can trust — a fixed test set, a scoring method, and a way to compare runs over time.",
    summaryZh: "评测框架把「我感觉它现在表现更好了」这种主观印象，变成一个你可以信赖的具体数字——依托一份固定的测试集、一种评分方法，以及随时间对比多次运行结果的手段。",
    tags: ["agentic-ai", "evaluation", "testing", "deeplearningai"],
    bodyEn: `Without a harness, agent development regresses into "try a change, run it a few times by hand, decide it seems better" — unreliable because a handful of manual runs can't distinguish real improvement from noise, and because there's no record to catch a change that fixes one case while quietly breaking another.

The minimum viable harness:

1. **A fixed test set.** A representative sample of real (or realistic) tasks, ideally including known-hard cases and past failures — not just easy cases the agent already handles well. Update it deliberately over time as new failure modes are discovered, not ad hoc per run.
2. **A scoring method per task.** Where possible, a deterministic checker (module 1, page 10's external verifiers — did the code pass tests? does the output match a schema?). Where a deterministic check isn't possible, an LLM-as-judge scoring against an explicit rubric, with the rubric's reliability itself spot-checked against human judgment periodically.
3. **Run-over-run comparison.** Store results per version/commit so a change's actual effect is visible — did success rate go up, and did efficiency (page 43) get worse in exchange?
4. **Failure case inspection, not just an aggregate score.** The score tells you *whether* something regressed; reading the actual failing trajectories tells you *why* — budget time for this every time the aggregate number moves.

Start this harness early, even a small one (10-20 cases) — retrofitting evaluation onto an agent that's already grown complex is far more expensive than building it alongside the agent from the start, and "we'll add evals later" is one of the most common regrets in agent development.`,
    bodyZh: `如果没有评测框架，智能体开发就会退化为"改一下、手动跑几次、感觉好像变好了"——这是不可靠的，因为寥寥几次手动运行无法区分真实的改进与随机噪声，而且没有记录能捕捉到"修好了一个案例、却悄悄破坏了另一个案例"这种变化。

一个最小可行的评测框架应包含：

1. **一份固定的测试集。** 具有代表性的真实（或贴近真实）任务样本，最好包含已知的困难案例和过往的失败案例——而不仅仅是智能体已经处理得很好的简单案例。要随时间有意识地更新它，在发现新的失败模式时纳入，而不是每次运行都临时凑一份。
2. **每个任务的评分方法。** 尽可能采用确定性的检验器（第 1 模块第 10 页提到的外部验证器——代码是否通过了测试？输出是否符合 schema？）。在无法采用确定性检验的地方，可用"LLM 作为评判者"依据一份明确的评分标准打分，并定期用人工判断对该评分标准本身的可靠性进行抽查。
3. **跨运行版本的对比。** 按版本/提交存储结果，使一次变更的实际影响可见——成功率是否提升了？效率（第 43 页）是否为此付出了代价而变差？
4. **审查失败案例，而不只是看汇总分数。** 分数告诉你*是否*出现了退化；阅读真实失败的轨迹则告诉你*为什么*——每次汇总数字发生变化时，都应留出时间做这件事。

尽早搭建这样的评测框架，哪怕规模很小（10—20 个案例）——在一个已经变得复杂的智能体上事后补建评估，远比从一开始就与智能体同步搭建要昂贵得多；"我们以后再加评测"是智能体开发中最常见、也最令人后悔的想法之一。`,
    learningMapEn: `- Learn the 4-part minimum viable harness: test set, scoring method, run comparison, failure inspection
- Understand why aggregate scores need to be paired with reading actual failures
- Prefer deterministic checkers over LLM-as-judge wherever possible
- Start small early rather than retrofitting evaluation later`,
    learningMapZh: `- 掌握最小可行评测框架的 4 个部分：测试集、评分方法、跨运行对比、失败案例审查
- 理解为何汇总分数需要与阅读真实失败案例相结合
- 尽可能优先使用确定性检验器，而非"LLM 作为评判者"
- 尽早从小规模开始，而不是事后补建评测`,
    handsOnEn: `1. Assemble a fixed test set of 10-20 representative tasks, including at least 2 known-hard cases.
2. Write a scoring method for each — deterministic where possible, LLM-as-judge with an explicit rubric otherwise.
3. Run the harness against your current agent and store the results with a version tag.
4. After your next change, re-run the harness and read the transcripts of any newly-failing case.`,
    handsOnZh: `1. 组建一份包含 10—20 个代表性任务的固定测试集，其中至少包含 2 个已知的困难案例。
2. 为每个任务编写评分方法——能用确定性方法的地方就用确定性方法，否则用带明确评分标准的"LLM 作为评判者"。
3. 用该评测框架运行你当前的智能体，并为结果打上版本标签存档。
4. 在下一次改动后重新运行评测框架，并阅读任何新出现的失败案例的完整轨迹。`,
    resources: [
      {
        title: "Agentic AI — DeepLearning.AI",
        url: "https://www.deeplearning.ai/courses/agentic-ai",
        description: "Weaves systematic error analysis and testing frameworks throughout its hands-on curriculum.",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Recommends establishing evals early, before agent complexity grows.",
      },
    ],
  },
  {
    order: 45,
    key: "guardrails-constraining-actions",
    titleEn: "Guardrails: Constraining Agent Actions",
    titleZh: "护栏：约束智能体的行为",
    category: "best-practices",
    summaryEn:
      "A guardrail is a hard constraint enforced by your code, not a polite request in a prompt — the difference matters because prompts can be worked around and code paths can't.",
    summaryZh: "护栏是由你的代码强制执行的硬性约束，而不是写在 prompt 里的礼貌请求——这个区别很重要，因为 prompt 可以被绕过，而代码路径无法被绕过。",
    tags: ["agentic-ai", "safety", "guardrails", "deeplearningai"],
    bodyEn: `"Don't do X" in a system prompt is a strong signal, not a guarantee — a sufficiently unusual input, an edge case the prompt didn't anticipate, or an adversarial user can still produce an agent action the prompt was trying to prevent. Real guardrails live in code the model can't talk its way around:

- **Permission boundaries, enforced at the tool layer.** If an agent shouldn't be able to delete production data, the tool it calls to touch that data simply shouldn't have delete permission — not "the prompt says not to delete," but "the credential physically can't."
- **Allow-lists over deny-lists.** Enumerate what an agent *can* do rather than what it can't — a deny-list has to anticipate every bad action in advance; an allow-list is safe by default against anything unanticipated.
- **Input/output validation.** Check tool call arguments against expected schemas *before* execution (module 2, page 13), and check outputs against policy *before* they reach a user or a downstream system — both are code-level checks, not model-level promises.
- **Rate and cost limits.** Hard caps on tool calls, spend, or external-facing actions per task/session — protects against both malicious inputs and ordinary bugs (an accidental infinite loop is just as costly as a deliberate one).
- **Staged rollout of autonomy.** Start a new agent capability with a human approving every action, then progressively loosen to human-approves-risky-actions-only, then fully autonomous — only after the guardrails above have actually been exercised and trusted in practice, not on day one.

The mental model worth internalizing: **prompts are guidance for a cooperative agent; guardrails are constraints for an agent that might, for any reason, not cooperate.** Design the guardrail layer as if the model will eventually try to do the wrong thing, because eventually, on some input, it will.`,
    bodyZh: `系统 prompt 中的"不要做 X"是一个强烈的信号，但不是一种保证——一个足够反常的输入、一个 prompt 没有预料到的边界情况，或一个心怀恶意的用户，仍然可能促使智能体做出 prompt 原本想要阻止的行为。真正的护栏，存在于模型无法凭"说服"绕过的代码之中：

- **在工具层强制执行的权限边界。** 如果一个智能体不应该能够删除生产数据，那么它调用来接触这些数据的工具，就根本不应该拥有删除权限——不是"prompt 说不要删除"，而是"这个凭证在物理上就做不到"。
- **白名单优于黑名单。** 枚举智能体*能*做什么，而不是不能做什么——黑名单必须提前预判每一种可能出现的坏行为；而白名单对任何未曾预料到的情况，默认就是安全的。
- **输入/输出校验。** 在执行*之前*，依据预期的 schema 校验工具调用参数（第 2 模块第 13 页）；在结果到达用户或下游系统*之前*，依据策略校验输出——这两者都是代码层面的检查，而不是模型层面的承诺。
- **速率与成本限制。** 对每个任务/会话的工具调用次数、支出，或面向外部的行为设定硬性上限——既能防范恶意输入，也能防范普通的 bug（一个意外的无限循环，其代价并不亚于一个蓄意的无限循环）。
- **自主性的分阶段放开。** 一项新的智能体能力，起步阶段让人类审批每一个动作，然后逐步放宽到"只审批高风险动作"，最终才走向完全自主——而且要在上述护栏已经在实践中被真正检验并获得信任之后再放开，而不是从第一天就直接放开。

值得内化的心智模型是：**prompt 是给一个愿意配合的智能体提供的指引；护栏则是为一个可能出于任何原因不配合的智能体设置的约束。** 应当假设模型最终会在某个输入上尝试做错误的事情来设计护栏层，因为在某个输入上，它终究会这样做。`,
    learningMapEn: `- Understand why prompt instructions alone are guidance, not enforcement
- Learn 5 concrete guardrail types: permission boundaries, allow-lists, I/O validation, rate/cost limits, staged autonomy
- Internalize "prompts guide cooperation, guardrails constrain non-cooperation"
- Practice converting one prompt-only rule into a code-enforced guardrail`,
    learningMapZh: `- 理解为何仅靠 prompt 指令只是指引，而非强制执行
- 掌握 5 种具体护栏类型：权限边界、白名单、输入/输出校验、速率/成本限制、分阶段自主性
- 内化"prompt 引导配合，护栏约束不配合"这一心智模型
- 练习把一条仅存在于 prompt 中的规则转化为代码强制执行的护栏`,
    handsOnEn: `1. Find one "don't do X" instruction that currently lives only in your system prompt.
2. Convert it into a code-level guardrail (permission boundary, schema validation, or allow-list).
3. Add a hard rate/cost cap on tool calls or spend per task.
4. Design a staged-rollout plan for one risky capability: human-approves-all -> human-approves-risky -> autonomous.`,
    handsOnZh: `1. 找出一条目前只存在于你的系统 prompt 中的"不要做 X"指令。
2. 把它转化为代码层面的护栏（权限边界、schema 校验，或白名单）。
3. 为每个任务的工具调用次数或支出加上硬性的速率/成本上限。
4. 为一项高风险能力设计一个分阶段放开计划：人类审批所有动作 -> 人类只审批高风险动作 -> 完全自主。`,
    resources: [
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Discusses enforcing constraints in code rather than relying solely on prompted behavior.",
      },
      {
        title: "Anthropic — Tool use with Claude",
        url: "https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview",
        description: "Covers permission scoping and validation at the tool-execution layer.",
      },
    ],
  },
  {
    order: 46,
    key: "human-in-the-loop",
    titleEn: "Human-in-the-Loop Design Patterns",
    titleZh: "人机协同设计模式",
    category: "best-practices",
    summaryEn:
      "Full autonomy isn't the end goal for most production agents — the goal is putting a human at exactly the points where their judgment adds the most value per second spent.",
    summaryZh: "对大多数生产环境中的智能体而言，完全自主并非终极目标——真正的目标，是把人类精确地放在他们的判断力每花一秒钟能带来最大价值的那些节点上。",
    tags: ["agentic-ai", "safety", "human-in-the-loop", "deeplearningai"],
    bodyEn: `"Human-in-the-loop" isn't one pattern but several, each suited to a different point in the trust/risk spectrum:

- **Approve-before-execute.** The agent proposes an action; a human must approve before it actually runs. Highest safety, highest human time cost — reserve for genuinely high-stakes, low-frequency actions (sending an external email, a financial transaction, deleting data).
- **Approve-risky-only.** Most actions execute autonomously; specific action types (flagged by the guardrail layer, page 45) require approval. The common middle ground for production systems once low-risk autonomy has been validated.
- **Review-after-execute.** The agent acts autonomously and a human reviews a sample (or all) of completed actions afterward — appropriate once an action type has a track record and the cost of a rare mistake is recoverable, not catastrophic.
- **Escalate-on-uncertainty.** The agent itself decides when to involve a human — when its own confidence is low, when it hits the ambiguity case from module 3 (page 24), or when it's about to take an action outside its normal pattern. This requires the agent to have some notion of its own uncertainty, which is harder to build reliably than the other three patterns but scales human attention to where it's actually needed instead of a fixed policy.
- **Interruptible, not just gated.** Even autonomous execution should support a human stepping in mid-task — pausing, redirecting, or stopping — rather than only offering approval at fixed checkpoints; this is one of the concrete things checkpointing (module 6, page 38) exists to support.

The design question for any given action type: what's the actual cost of a mistake here, and how frequently does this action type occur? High cost + low frequency favors approve-before-execute; low cost + high frequency favors autonomous-with-sampled-review; everything in between is where escalate-on-uncertainty earns its complexity.`,
    bodyZh: `"人机协同"并不是单一的一种模式，而是有好几种，各自适用于信任/风险谱系上的不同位置：

- **执行前审批。** 智能体提出一个动作；必须经过人类批准后才能真正执行。安全性最高，人力成本也最高——应保留给真正高风险、低频率的动作（发送外部邮件、金融交易、删除数据）。
- **仅高风险动作需审批。** 大多数动作自主执行；由护栏层（第 45 页）标记出的特定类型动作需要审批。这是低风险自主性经过验证后，生产系统普遍采用的折中方案。
- **执行后审阅。** 智能体自主行动，人类事后审阅已完成动作的样本（或全部）——适用于该类动作已有一定表现记录、且偶发错误的代价是可挽回、而非灾难性的情形。
- **不确定时上报。** 由智能体自己决定何时需要人类介入——当它自身的置信度较低时、当遇到第 3 模块（第 24 页）提到的模糊性情形时，或当它即将采取一个超出其常规模式的动作时。这要求智能体对自身的不确定性有某种认知，比前三种模式更难可靠地实现，但能把人类的注意力精准配置到真正需要的地方，而不是套用一个固定的策略。
- **可随时打断，而非仅在固定节点设卡。** 即便是自主执行，也应支持人类在任务进行中途介入——暂停、重新引导，或直接停止——而不仅仅是在固定检查点提供审批选项；这正是检查点机制（第 6 模块第 38 页）所要支持的具体能力之一。

针对任何一类具体动作，都值得问这样一个设计问题：这里犯错的实际代价是多少？这类动作发生的频率有多高？高代价 + 低频率，更适合"执行前审批"；低代价 + 高频率，更适合"自主执行 + 抽样审阅"；介于两者之间的情况，正是"不确定时上报"这种模式的复杂度能够物有所值的地方。`,
    learningMapEn: `- Learn 5 human-in-the-loop patterns: approve-before, approve-risky-only, review-after, escalate-on-uncertainty, interruptible
- Apply the "cost of mistake x frequency" decision matrix to pick the right pattern per action type
- Understand escalate-on-uncertainty's requirement for the agent to model its own confidence
- Design for mid-task interruption, not just fixed-checkpoint approval`,
    learningMapZh: `- 掌握 5 种人机协同模式：执行前审批、仅高风险需审批、执行后审阅、不确定时上报、可随时打断
- 运用"错误代价 x 发生频率"决策矩阵，为每类动作选择合适的模式
- 理解"不确定时上报"模式要求智能体对自身置信度有所建模
- 设计支持任务进行中被打断的机制，而不仅是固定检查点式审批`,
    handsOnEn: `1. List your agent's action types and estimate the cost-of-mistake and frequency for each.
2. Assign each action type to one of the 5 human-in-the-loop patterns based on that matrix.
3. Implement approve-before-execute for your single highest-stakes action.
4. Add mid-task interruption support (pause/stop) for at least one long-running action.`,
    handsOnZh: `1. 列出你智能体的各类动作，估算每一类的错误代价与发生频率。
2. 基于该矩阵，为每类动作指定 5 种人机协同模式中的一种。
3. 为风险最高的那一个动作实现"执行前审批"。
4. 为至少一个长时间运行的动作，加入任务进行中的打断支持（暂停/停止）。`,
    resources: [
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "Checkpointing and interrupt primitives directly supporting human-in-the-loop patterns.",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Discusses calibrating agent autonomy to the stakes of the task at hand.",
      },
    ],
  },
  {
    order: 47,
    key: "common-failure-modes",
    titleEn: "Common Failure Modes of Agentic Systems",
    titleZh: "智能体系统的常见失败模式",
    category: "use-cases",
    summaryEn:
      "Most agent failures in production fall into a handful of recurring categories — recognizing the pattern is faster than debugging each incident from first principles.",
    summaryZh: "生产环境中大多数智能体的失败，都可以归入为数不多的几类反复出现的模式——识别出这种模式，比每次都从头开始排查故障要快得多。",
    tags: ["agentic-ai", "safety", "failure-modes", "deeplearningai"],
    bodyEn: `A working catalog of the failure modes covered across this curriculum, gathered in one place for fast diagnosis:

- **Runaway loops** (module 0, page 3) — no stop condition, or one that's never actually reached; the agent keeps acting past the point where it should have stopped.
- **Tool selection errors** (module 2, page 14) — the wrong tool called, or the right tool called with wrong arguments, typically worsening as the tool count grows.
- **Silent context loss** (module 5, page 36) — old but important context gets truncated without anyone noticing, and later steps act on an incomplete picture.
- **Stale-plan execution** (module 3, page 25) — the agent keeps executing a plan that its own earlier steps have already invalidated, because nothing checked.
- **Coordination breakdowns** (module 4, page 32) — duplicated work, unreconciled contradictions between agents, or nobody actually verifying the overall goal was met.
- **Agreement-biased self-critique** (module 1, page 8) — reflection that rubber-stamps the original output instead of genuinely finding problems.
- **Confident hallucination presented as fact** — an agent stating something as verified when it was actually reasoned/guessed, with no tool call or retrieval to back it — the single most damaging failure mode for user trust, because it's indistinguishable from correct output without independent verification.
- **Guardrail-only-in-prompt failures** (module 7, page 45) — a constraint that lives in a system prompt gets worked around by an unusual input, because nothing in code actually enforced it.
- **Cost/latency blowouts with no visible cause** — usually one of: unbounded retries, an unnecessarily long reflection loop, or a tool being called far more than the task requires.

Treat this as a diagnostic checklist: when an agent misbehaves, work through it before assuming the failure is novel — most production incidents turn out to be a known pattern from this list, not a new phenomenon requiring first-principles debugging.`,
    bodyZh: `本课程涉及的失败模式汇总在一处，便于快速诊断：

- **失控循环**（第 0 模块第 3 页）——没有停止条件，或有停止条件但从未真正被触发；智能体在早该停下的地方继续行动。
- **工具选择错误**（第 2 模块第 14 页）——调用了错误的工具，或调用了正确的工具但参数错误，通常随工具数量增多而愈发严重。
- **无声的上下文丢失**（第 5 模块第 36 页）——旧但重要的上下文在无人察觉的情况下被截断，导致后续步骤基于不完整的情况采取行动。
- **执行过时的计划**（第 3 模块第 25 页）——智能体继续执行一份已被自己更早的步骤证伪的计划，因为没有任何环节对此进行检查。
- **协调崩溃**（第 4 模块第 32 页）——重复劳动、智能体之间未被调和的矛盾，或没有任何一方真正验证过整体目标是否达成。
- **附和偏向式的自我批评**（第 1 模块第 8 页）——反思环节只是对原始输出走个过场，而非真正发现问题。
- **自信满满的幻觉被当作事实呈现**——智能体把一个实际上是推理/猜测出来的内容，说成已经过验证的事实，背后没有任何工具调用或检索作为支撑——这是对用户信任伤害最大的单一失败模式，因为在没有独立核实的情况下，它与正确输出无法区分。
- **仅存在于 prompt 中的护栏失效**（第 7 模块第 45 页）——一条只存在于系统 prompt 中的约束，被一个反常输入绕开了，因为代码中并没有任何机制真正强制执行它。
- **无明显原因的成本/延迟暴涨**——通常是以下之一：无限制的重试、不必要的冗长反思循环，或某个工具被调用的次数远超任务实际需要。

把这份清单当作一份诊断检查表：当智能体出现异常行为时，先按此清单排查一遍，再假设这是一个全新的失败——大多数生产环境中的事故，最终都会归结为这份清单中的某个已知模式，而不是需要从头开始、从第一性原理排查的新现象。`,
    learningMapEn: `- Review all 9 failure modes as one consolidated diagnostic checklist
- Trace each failure mode back to the module page where it was covered in depth
- Learn to recognize confident hallucination as the highest-trust-cost failure
- Practice diagnosing a real agent incident against this list before first-principles debugging`,
    learningMapZh: `- 把 9 种失败模式作为一份汇总的诊断检查表加以复习
- 把每种失败模式追溯回本课程中深入讲解它的那一页
- 学会识别"自信的幻觉"是对信任伤害最大的失败模式
- 在从第一性原理排查之前，先依据这份清单诊断一次真实的智能体事故`,
    handsOnEn: `1. Pick a real (or past) agent incident and match it against this 9-item checklist.
2. For the matched failure mode, revisit the module page that covers the fix in depth.
3. Audit your own agent for at least 2 of these failure modes proactively, before they cause an incident.
4. Add this checklist to your team's incident-response process as a first diagnostic pass.`,
    handsOnZh: `1. 找一个真实（或过去发生过）的智能体事故，将其与这 9 项检查表逐一比对。
2. 针对匹配到的失败模式，回顾深入讲解其解决方案的那一页。
3. 主动审查你自己的智能体，检查是否存在这 9 种失败模式中至少 2 种，抢在其引发事故之前。
4. 把这份检查表加入你团队的事故响应流程，作为第一轮诊断依据。`,
    resources: [
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Field-tested guidance on the most common ways agentic systems fail in production.",
      },
      {
        title: "Agentic AI — DeepLearning.AI",
        url: "https://www.deeplearning.ai/courses/agentic-ai",
        description: "Builds systematic error analysis directly into its hands-on curriculum.",
      },
    ],
  },
  {
    order: 48,
    key: "cost-latency-token-budget",
    titleEn: "Cost, Latency, and Token Budget Management for Agents",
    titleZh: "智能体的成本、延迟与 token 预算管理",
    category: "step-by-step",
    summaryEn:
      "An agent's cost and latency are functions of design choices made throughout this whole curriculum — this page pulls them together into one practical budget-setting process.",
    summaryZh: "智能体的成本与延迟，取决于贯穿本课程始终所做的一系列设计选择——本页把这些线索汇总为一套实用的预算设定流程。",
    tags: ["agentic-ai", "cost-management", "production", "deeplearningai"],
    bodyEn: `Every pattern in this curriculum has a cost/latency lever attached — reflection roughly doubles a step's cost (module 1, page 11), tree-of-thoughts multiplies it by the branching factor (module 3, page 22), multi-agent adds a full generation per agent (module 4, page 26), long-running memory retrieval adds a lookup per turn (module 5, page 34). Managing an agent's economics means being deliberate about which of these levers you're pulling and why.

A practical step-by-step process for setting and enforcing a budget:

1. **Set a target cost and latency per task**, before building — driven by what the task is worth (an internal research assistant can tolerate more cost/latency than a real-time customer-facing chat agent).
2. **Attribute current cost/latency to specific design choices** — how much is reflection passes, how much is tool calls, how much is context length driving up input tokens? You can't cut what you haven't measured.
3. **Cut the highest-cost, lowest-value lever first** — often reflection passes that don't measurably improve quality (module 1, page 11) or retrieval calls that fire on every turn regardless of relevance (module 5, page 34).
4. **Set hard caps as a backstop, not just a target** — max steps, max tool calls, max tokens per task (module 2, page 15's retry caps, generalized to the whole task) — a budget without enforcement is just a hope.
5. **Re-measure after every significant change** — a fix for one failure mode (e.g. adding re-planning, module 3 page 25) often adds cost elsewhere; the eval harness (page 44) should track cost/latency alongside accuracy, not accuracy alone.

The discipline underneath all of this, echoing the reflection page's core lesson: **every capability added to an agent has a cost, and the right amount to add is whatever the task's actual value justifies — not the maximum sophistication available.**`,
    bodyZh: `本课程中的每一种模式，都带有相应的成本/延迟杠杆——反思大致会让一步的成本翻倍（第 1 模块第 11 页），思维树会按分支因子成倍放大成本（第 3 模块第 22 页），多智能体每增加一个智能体就要增加一次完整生成（第 4 模块第 26 页），长期记忆检索会为每一轮增加一次查找（第 5 模块第 34 页）。管理智能体的经济性，意味着要有意识地决定拉动哪些杠杆、以及为什么要拉动它们。

一套实用的、逐步设定并强制执行预算的流程：

1. **在构建之前，为每个任务设定目标成本和延迟**——依据该任务的实际价值来确定（一个内部研究助手可以承受比面向客户的实时聊天智能体更高的成本/延迟）。
2. **把当前的成本/延迟归因到具体的设计选择上**——有多少来自反思环节，有多少来自工具调用，有多少来自因上下文过长而推高的输入 token？没有测量过的东西，就无法削减。
3. **优先削减"成本最高、价值最低"的杠杆**——往往是那些没有可衡量地提升质量的反思环节（第 1 模块第 11 页），或那些不论是否相关、每一轮都会触发的检索调用（第 5 模块第 34 页）。
4. **设定硬性上限作为兜底，而不仅仅是一个目标**——每个任务的最大步数、最大工具调用次数、最大 token 数（把第 2 模块第 15 页的重试上限，推广到整个任务层面）——一个没有强制执行的预算，只是一个愿望而已。
5. **每次重大改动后都重新测量**——修复一种失败模式（例如加入重新规划，第 3 模块第 25 页）往往会在别处增加成本；评测框架（第 44 页）应当把成本/延迟与准确率一并追踪，而不是只看准确率。

贯穿这一切的核心纪律，呼应了反思那一页的核心结论：**为智能体新增的每一项能力都有其代价，恰当的投入量，应当由任务的实际价值来决定——而不是尽可能追求最复杂精细的方案。**`,
    learningMapEn: `- Trace each earlier module's cost/latency lever back to this page's budget process
- Learn the 5-step process: set target, attribute cost, cut lowest-value levers, enforce hard caps, re-measure
- Understand hard caps as a backstop distinct from a soft target
- Internalize the closing discipline: capability added should match the task's actual value`,
    learningMapZh: `- 把前面各模块的成本/延迟杠杆，追溯回本页的预算设定流程
- 掌握 5 步流程：设定目标、归因成本、削减低价值杠杆、强制硬性上限、重新测量
- 理解硬性上限作为兜底、有别于软性目标
- 内化最后的纪律：新增能力应与任务的实际价值相匹配`,
    handsOnEn: `1. Set a target cost and latency per task for your agent, based on what the task is actually worth.
2. Break down current cost/latency by design choice: reflection, tool calls, context length, retrieval.
3. Identify and cut the single highest-cost, lowest-measured-value lever.
4. Add a hard cap (max steps/tool calls/tokens) as a backstop, and re-run your eval harness to confirm the effect.`,
    handsOnZh: `1. 基于任务的实际价值，为你的智能体设定每个任务的目标成本和延迟。
2. 按设计选择拆解当前的成本/延迟：反思、工具调用、上下文长度、检索。
3. 找出并削减那个成本最高、但可衡量价值最低的单一杠杆。
4. 加入一个硬性上限（最大步数/工具调用次数/token 数）作为兜底，并重新运行评测框架确认效果。`,
    resources: [
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Frames added agent complexity/cost as something that must be justified by task value.",
      },
      {
        title: "Agentic AI — DeepLearning.AI",
        url: "https://www.deeplearning.ai/courses/agentic-ai",
        description: "Includes optimizing systems for production deployment as part of its curriculum.",
      },
    ],
  },
];
