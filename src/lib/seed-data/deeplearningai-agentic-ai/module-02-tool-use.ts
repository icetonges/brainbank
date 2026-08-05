import type { SeedPage } from "./types";

// Module 2 — Tool Use (7 pages, order 12-18). Second of Andrew Ng's four
// agentic design patterns.
export const module02ToolUse: SeedPage[] = [
  {
    order: 12,
    key: "function-calling-fundamentals",
    titleEn: "Function Calling Fundamentals",
    titleZh: "函数调用基础",
    category: "api",
    summaryEn:
      "Function calling is the mechanism underneath Tool Use: the model outputs a structured call, your code executes it, and the result goes back into context.",
    summaryZh: "函数调用是「工具使用」背后的机制：模型输出一个结构化的调用请求，你的代码执行它，结果再被送回上下文。",
    tags: ["agentic-ai", "tool-use", "function-calling", "deeplearningai"],
    bodyEn: `Every major model provider (Anthropic, OpenAI, Google) exposes some version of the same primitive: you describe a set of functions (name, description, parameter schema) alongside your prompt, and the model can respond with a structured request to call one — instead of, or alongside, natural-language text.

The actual execution is **never** done by the model. The loop is:

1. Send the prompt plus tool definitions to the model.
2. The model returns either a text response or a tool-call request (function name + arguments, usually as JSON matching the schema you provided).
3. Your code executes that function for real, with whatever validation and permissions you choose to enforce.
4. You send the function's result back to the model as a new message.
5. The model continues — either calling another tool or producing a final answer.

The model's job is only steps 2 and 5: deciding *what* to call and *when* to stop. Everything else — actually running the code, handling errors, enforcing rate limits or permissions — is your application's responsibility. This separation is the entire safety model: an agent can only do what your code lets its tool-calls actually execute, no matter what it "asks" for.`,
    bodyZh: `每个主要的模型厂商（Anthropic、OpenAI、Google）都提供了某种版本的同一原语：你在 prompt 之外描述一组函数（名称、描述、参数 schema），模型就可以返回一个结构化的调用请求——取代或伴随自然语言文本一起返回。

真正的执行**永远不会**由模型来完成。整个流程是：

1. 将 prompt 和工具定义一起发送给模型。
2. 模型返回文本回复，或者一个工具调用请求（函数名 + 参数，通常是符合你提供的 schema 的 JSON）。
3. 你的代码真正执行该函数，并施加你所选择的任何校验与权限控制。
4. 你把函数的执行结果作为一条新消息发回给模型。
5. 模型继续——要么调用另一个工具，要么给出最终答案。

模型的职责只在第 2 步和第 5 步：决定调用*什么*、以及*何时*停止。其余一切——真正运行代码、处理错误、执行速率限制或权限控制——都是你的应用程序的责任。这种职责分离正是整个安全模型的基础：无论智能体"请求"什么，它能做的事情，都只限于你的代码真正允许其工具调用执行的范围。`,
    learningMapEn: `- Walk through the 5-step function-calling loop
- Understand that execution is always your code's responsibility, never the model's
- See why this separation is the core of agent safety
- Compare function-calling APIs across providers at a high level`,
    learningMapZh: `- 走一遍函数调用的 5 步流程
- 理解执行永远是你代码的责任，而非模型的责任
- 认识到这种职责分离是智能体安全模型的核心
- 从高层次比较不同厂商的函数调用 API`,
    handsOnEn: `1. Define one function with a name, description, and JSON parameter schema.
2. Send a prompt that should trigger that tool call and inspect the model's raw tool-call output.
3. Write the execution code that actually runs the function and returns a result.
4. Feed the result back and confirm the model produces a correct final answer using it.`,
    handsOnZh: `1. 定义一个函数，包含名称、描述和 JSON 参数 schema。
2. 发送一个应当触发该工具调用的 prompt，检查模型返回的原始工具调用输出。
3. 编写真正执行该函数并返回结果的代码。
4. 把结果反馈回去，确认模型能用它给出正确的最终答案。`,
    resources: [
      {
        title: "Anthropic — Tool use with Claude",
        url: "https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview",
        description: "Official documentation for defining and handling tool calls with Claude.",
      },
      {
        title: "OpenAI — Function calling",
        url: "https://platform.openai.com/docs/guides/function-calling",
        description: "The equivalent mechanism on the OpenAI API, for comparison.",
      },
    ],
  },
  {
    order: 13,
    key: "designing-tool-interfaces",
    titleEn: "Designing Good Tool Interfaces for Agents",
    titleZh: "为智能体设计优秀的工具接口",
    category: "best-practices",
    summaryEn:
      "A tool's name, description, and parameter schema are themselves a prompt — badly designed tools cause more agent failures than badly chosen models.",
    summaryZh: "工具的名称、描述和参数 schema 本身就是一种 prompt——设计糟糕的工具，比选错模型造成的智能体失败更多。",
    tags: ["agentic-ai", "tool-use", "api-design", "deeplearningai"],
    bodyEn: `The model decides which tool to call and how based entirely on the text you gave it — the tool's name, description, and parameter docs. Treat that surface with the same care as a prompt, because it is one.

Practical guidelines that consistently reduce agent errors:

- **Name tools by what they do, not how they're implemented.** \`get_customer_order_history\`, not \`query_orders_table_v3\`.
- **Write the description for a reader who's never seen your codebase.** Include what the tool returns, what it *doesn't* do, and any preconditions ("requires a valid order ID from search_orders first").
- **Fewer, broader tools usually beat many narrow ones.** A model choosing among 40 similarly-named tools makes more selection errors than one choosing among 8 well-differentiated ones. Consolidate near-duplicate tools.
- **Make invalid states unrepresentable in the schema.** If a parameter can only be one of three values, use an enum, not a free-text string — this prevents an entire class of malformed calls.
- **Return errors as data, not exceptions that crash the loop.** A failed tool call should come back as a structured "here's what went wrong," so the agent can reason about and recover from it in the next step (more in the next page).

A useful test: hand your tool definitions (with zero other context) to a colleague and ask them to describe what each one does. If they can't, the model likely can't either.`,
    bodyZh: `模型完全依据你提供的文本——工具的名称、描述和参数文档——来决定调用哪个工具、以及如何调用。要以对待 prompt 同样的谨慎态度对待这部分内容，因为它本质上就是 prompt。

以下是能持续减少智能体错误的实践准则：

- **按工具"做什么"命名，而不是按"如何实现"命名。** 用 \`get_customer_order_history\`，而不是 \`query_orders_table_v3\`。
- **为从未见过你代码库的读者撰写描述。** 写清楚该工具返回什么、*不*做什么，以及任何前置条件（"需要先通过 search_orders 获得有效的订单 ID"）。
- **数量更少、覆盖面更广的工具，通常优于数量众多、划分很细的工具。** 模型在 40 个名称相似的工具中做选择，出错率会高于在 8 个区分度很高的工具中做选择。应合并近似重复的工具。
- **让无效状态在 schema 层面就无法表示。** 如果一个参数只能取三个值之一，就用枚举，而不是自由文本字符串——这能在源头上杜绝一整类格式错误的调用。
- **把错误作为数据返回，而不是让异常直接打断循环。** 失败的工具调用应当以结构化的"出了什么问题"形式返回，这样智能体才能在下一步中对此进行推理和恢复（详见下一页）。

一个实用的检验方法：把你的工具定义（不附带任何其他上下文）交给一位同事，让他描述每个工具的作用。如果他做不到，模型很可能也做不到。`,
    learningMapEn: `- Treat tool name/description/schema as a prompt, not just an API contract
- Apply 5 concrete guidelines: naming, description depth, tool count, enums, structured errors
- Learn the "hand it to a colleague" test for tool clarity
- Preview: structured error handling is covered fully next`,
    learningMapZh: `- 把工具的名称/描述/schema 当作 prompt 来对待，而不仅是 API 契约
- 应用 5 条具体准则：命名、描述深度、工具数量、枚举、结构化错误
- 掌握"交给同事看一看"这一清晰度检验方法
- 预告：下一页将完整讲解结构化错误处理`,
    handsOnEn: `1. Take an existing tool definition and rewrite its name and description using the guidelines above.
2. Replace one free-text parameter with an enum where the valid values are actually fixed.
3. Count your total tool list; if over ~15-20, identify two that could be consolidated.
4. Run the "hand it to a colleague" test on your top 3 most-used tools.`,
    handsOnZh: `1. 选一个现有的工具定义，依据上述准则重写它的名称和描述。
2. 把一个实际取值固定的自由文本参数改为枚举。
3. 数一下你的工具总数；如果超过约 15—20 个，找出两个可以合并的。
4. 对你使用最频繁的 3 个工具做"交给同事看一看"测试。`,
    resources: [
      {
        title: "Anthropic — Tool use with Claude",
        url: "https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview",
        description: "Includes explicit guidance on writing clear tool descriptions and schemas.",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Notes tool design as a common, underrated source of agent failure.",
      },
    ],
  },
  {
    order: 14,
    key: "tool-selection-routing",
    titleEn: "Tool Selection and Routing Among Many Tools",
    titleZh: "在众多工具中进行选择与路由",
    category: "skill",
    summaryEn:
      "Past roughly 15-20 tools, models start picking the wrong one or missing the right one — routing patterns exist precisely to keep the model's live choice set small.",
    summaryZh: "工具数量一旦超过约 15—20 个，模型就开始选错工具或漏掉正确的工具——路由模式的存在，正是为了让模型在任一时刻面对的选择集合保持较小。",
    tags: ["agentic-ai", "tool-use", "routing", "deeplearningai"],
    bodyEn: `As an agent's tool count grows, selection accuracy degrades — not because the model gets "dumber," but because every tool description competes for attention in the same context window, and semantically similar tools become genuinely hard to distinguish even for a careful reader.

Common patterns for keeping tool selection accurate at scale:

- **Hierarchical routing.** A first, cheap call picks a *category* of tools (e.g. "billing," "shipping," "account") from a small menu; only that category's tools are then exposed to the main reasoning call. This is the single most effective fix and mirrors how a human support team routes tickets.
- **Retrieval-based tool selection.** Embed tool descriptions, embed the user's request, and only include the top-k most relevant tools in context — treating the tool list itself like a RAG corpus.
- **Namespacing by domain.** Prefixing tool names (\`billing.refund\`, \`shipping.track\`) helps both the model and your own codebase reason about which subsystem a call belongs to.
- **Explicit "none of the above."** Always give the model a valid way to say no tool applies, or it will sometimes force-fit the closest-sounding one rather than asking a clarifying question.

Measure selection accuracy directly — log how often the agent picks a tool that a human reviewer would also have picked, per 100 calls — rather than assuming a routing layer works just because it's architecturally sound.`,
    bodyZh: `随着智能体工具数量的增长，选择准确率会下降——这并非因为模型"变笨了"，而是因为每个工具的描述都在同一个上下文窗口中争夺注意力，语义相近的工具即便对一个细心的读者来说，也确实很难区分。

以下是在规模扩大后仍能保持工具选择准确性的常见模式：

- **分层路由（Hierarchical routing）。** 先用一次成本低廉的调用，从一个小菜单中挑出一个工具*类别*（例如"账单"、"物流"、"账户"）；随后只把该类别下的工具暴露给主推理调用。这是最有效的单一修复手段，其思路与人工客服团队分派工单的方式如出一辙。
- **基于检索的工具选择。** 对工具描述做嵌入，对用户请求也做嵌入，只把相关度最高的 top-k 个工具纳入上下文——把工具列表本身当作一个 RAG 语料库来处理。
- **按领域做命名空间划分。** 为工具名称加前缀（如 \`billing.refund\`、\`shipping.track\`），有助于模型和你自己的代码库都能推断出某次调用属于哪个子系统。
- **明确提供"以上都不是"的选项。** 始终给模型一个合法的方式来表达"没有合适的工具"，否则它有时会硬套一个听起来最接近的工具，而不是去提出澄清问题。

要直接测量选择准确率——记录每 100 次调用中，智能体所选工具与人工审阅者会选的工具一致的比例——而不是仅仅因为路由层在架构上看起来合理，就假定它有效。`,
    learningMapEn: `- Understand why selection accuracy degrades as tool count grows
- Learn 4 patterns: hierarchical routing, retrieval-based selection, namespacing, explicit "none"
- Adopt selection-accuracy logging as a concrete metric
- Practice designing a routing layer for a tool list of 20+`,
    learningMapZh: `- 理解为何工具数量增加会导致选择准确率下降
- 掌握 4 种模式：分层路由、基于检索的选择、命名空间、明确的"以上都不是"
- 采用选择准确率日志作为具体度量指标
- 练习为一个 20+ 工具的列表设计路由层`,
    handsOnEn: `1. Count your current tool list; if over 15, group them into 3-5 categories.
2. Implement a first-pass "pick a category" call before exposing the full tool set.
3. Add an explicit "no tool applies, ask a clarifying question" option to your tool set.
4. Log 20 real tool-selection decisions and manually grade how many were correct.`,
    handsOnZh: `1. 数一下你当前的工具列表；如果超过 15 个，把它们分成 3—5 个类别。
2. 实现一次"先选类别"的前置调用，之后再暴露完整工具集。
3. 为你的工具集加入一个明确的"没有合适工具、需要澄清"选项。
4. 记录 20 次真实的工具选择决策，并人工评分正确率。`,
    resources: [
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Discusses keeping an agent's tool set small and well-organized as it scales.",
      },
      {
        title: "LangGraph documentation",
        url: "https://langchain-ai.github.io/langgraph/",
        description: "Shows routing-node patterns for directing execution to a subset of tools/agents.",
      },
    ],
  },
  {
    order: 15,
    key: "error-handling-retries",
    titleEn: "Error Handling and Retries in Tool-Using Agents",
    titleZh: "工具调用型智能体中的错误处理与重试",
    category: "best-practices",
    summaryEn:
      "A tool call failing is normal, expected traffic for an agent loop — the design question is what the agent sees when it happens, not whether it happens.",
    summaryZh: "工具调用失败对智能体循环来说是正常、预期中的情况——设计上真正要回答的问题是「失败发生时智能体看到了什么」，而不是「是否会发生失败」。",
    tags: ["agentic-ai", "tool-use", "error-handling", "deeplearningai"],
    bodyEn: `Network timeouts, invalid arguments, rate limits, permission denials, and downstream API errors will all happen in production. An agent that isn't designed for this treats every failure as a crash; one that is designed for it treats failure as just another observation to reason about.

Concrete practices:

- **Never let a raw exception reach the model.** Catch it, and return a structured error object: what failed, a machine-readable error code, and (where safe) a human-readable reason — the same "return errors as data" principle from tool design.
- **Distinguish retryable from non-retryable errors.** A timeout or rate limit is worth an automatic retry with backoff; a "permission denied" or "invalid customer ID" is not — retrying it just wastes budget and can loop forever.
- **Cap total retries per step and per task.** Without both limits, a single flaky tool can consume an entire cost/time budget, or worse, loop indefinitely.
- **Let the agent see *why* it failed, not just *that* it failed.** "Error: invalid date format, expected YYYY-MM-DD, got 03/15/2026" lets the model self-correct on the next attempt; "Error: 400" does not.
- **Fail loudly to a human when retries are exhausted.** A silently-abandoned task is worse than a clearly-reported failure — surface it rather than letting the agent quietly give up mid-task.

The overall design goal: every failure mode should be something the agent (or a human) can act on, not a dead end.`,
    bodyZh: `网络超时、无效参数、速率限制、权限拒绝，以及下游 API 的各种错误，在生产环境中都会发生。一个没有为此设计的智能体，会把每一次失败都当作崩溃来处理；而一个为此做好设计的智能体，会把失败当作又一个需要推理的观察结果。

具体做法：

- **绝不让原始异常直接传到模型面前。** 捕获它，返回一个结构化的错误对象：出了什么问题、一个机器可读的错误码，以及（在安全的情况下）一个人类可读的原因——这与工具设计中"把错误作为数据返回"是同一个原则。
- **区分可重试与不可重试的错误。** 超时或速率限制值得进行带退避的自动重试；而"权限被拒绝"或"客户 ID 无效"则不值得——重试只会浪费预算，甚至可能永远循环下去。
- **对每一步和每个任务都设定重试次数上限。** 如果没有这两层限制，一个不稳定的工具就可能耗尽整个成本/时间预算，甚至无限循环。
- **让智能体看到失败的*原因*，而不只是"失败了"这一事实。** "错误：日期格式无效，期望 YYYY-MM-DD，实际收到 03/15/2026"能让模型在下一次尝试中自我纠正；而"错误：400"则做不到这一点。
- **重试耗尽后要明确地报告给人类。** 一个悄无声息就被放弃的任务，比一个被清楚报告的失败更糟——应主动暴露问题，而不是让智能体在任务中途悄悄放弃。

总体设计目标是：每一种失败模式都应当是智能体（或人类）能够据此采取行动的信息，而不是一条死路。`,
    learningMapEn: `- Treat tool failures as expected traffic, not exceptional crashes
- Distinguish retryable vs. non-retryable errors and cap retries at two levels
- Write error messages the model can act on, not opaque codes
- Design "fail loudly to a human" for exhausted retries`,
    learningMapZh: `- 把工具失败视为预期中的正常情况，而非异常崩溃
- 区分可重试与不可重试的错误，并在两个层级设置重试上限
- 编写模型能据以行动的错误信息，而非不透明的错误码
- 为重试耗尽的情况设计"明确报告给人类"的机制`,
    handsOnEn: `1. Audit one tool integration: does a raw exception ever reach the model? Fix it if so.
2. Classify your tool's likely errors into retryable vs. non-retryable.
3. Add a per-step and per-task retry cap with backoff for retryable errors.
4. Rewrite one error message to include the specific reason and expected format.`,
    handsOnZh: `1. 审查一个工具集成：原始异常是否曾经直接传到模型面前？如果是，予以修复。
2. 把该工具可能出现的错误分类为可重试与不可重试。
3. 为可重试错误加上带退避的单步和单任务重试上限。
4. 重写一条错误信息，使其包含具体原因和期望格式。`,
    resources: [
      {
        title: "Anthropic — Tool use with Claude",
        url: "https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview",
        description: "Covers returning tool errors as structured results the model can reason about.",
      },
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "General guidance on robust error handling as a prerequisite for reliable agents.",
      },
    ],
  },
  {
    order: 16,
    key: "sandboxing-code-execution",
    titleEn: "Sandboxing and Code-Execution Tools",
    titleZh: "沙箱与代码执行类工具",
    category: "skill",
    summaryEn:
      "Letting an agent run code it wrote is one of the most powerful tools available and one of the most dangerous if the execution environment isn't isolated.",
    summaryZh: "让智能体运行它自己写的代码，是目前最强大的工具之一，如果执行环境未被隔离，也是最危险的工具之一。",
    tags: ["agentic-ai", "tool-use", "sandboxing", "deeplearningai"],
    bodyEn: `Code execution is what turns an agent from "can describe a solution" into "can compute one" — running data analysis, testing its own generated code, doing arithmetic a language model is bad at natively. It's also the tool category with the highest blast radius if misused, since arbitrary code can read files, make network calls, or consume unbounded resources.

Non-negotiable practices for any code-execution tool:

- **Isolate execution from your production environment.** A container or microVM (e.g. gVisor, Firecracker-based sandboxes) with no access to your real filesystem, secrets, or internal network — never \`eval\` in-process.
- **Set hard resource limits.** CPU time, memory, wall-clock timeout, and disk quota, all enforced by the sandbox itself, not by the code being trusted to behave.
- **Whitelist rather than blacklist network access.** Default to no network access; add specific allowed endpoints only if the task genuinely needs them.
- **Treat output as untrusted too.** Sandboxed code can still produce output designed to manipulate a downstream reflection step — validate/sanitize what comes back, don't feed it into the next prompt uncritically.
- **Log every execution.** Full code + output, for audit and for debugging when something goes wrong three steps later.

Nearly every serious agent framework and provider (OpenAI's Code Interpreter, Anthropic's code execution tool, E2B, Modal sandboxes) now ships a managed version of this rather than expecting teams to build their own — reach for one of those before rolling your own sandbox.`,
    bodyZh: `代码执行是让智能体从"能描述一个解决方案"变为"能计算出一个解决方案"的关键：运行数据分析、测试自己生成的代码、完成语言模型天生不擅长的算术运算。但它同时也是一旦被滥用、破坏半径最大的工具类别，因为任意代码可以读取文件、发起网络请求，或无限制地消耗资源。

对任何代码执行类工具而言，以下几点没有商量余地：

- **将执行环境与生产环境隔离。** 使用容器或微虚拟机（例如基于 gVisor、Firecracker 的沙箱），不允许访问你真实的文件系统、密钥或内部网络——绝不在进程内直接 \`eval\`。
- **设定硬性资源限制。** CPU 时间、内存、墙钟超时和磁盘配额，全部由沙箱本身强制执行，而不是寄希望于代码"表现良好"。
- **对网络访问采用白名单而非黑名单。** 默认不允许任何网络访问；只有在任务确实需要时，才添加特定的允许端点。
- **同样把输出视为不可信内容。** 沙箱中运行的代码，其输出仍然可能被设计用来操纵下游的反思步骤——应对返回内容进行校验/清洗，而不是不加分辨地直接喂给下一次 prompt。
- **记录每一次执行。** 完整的代码和输出都要留存，以便审计，以及在三步之后出现问题时进行调试。

如今几乎每一个正规的智能体框架和厂商（OpenAI 的 Code Interpreter、Anthropic 的代码执行工具、E2B、Modal 沙箱）都提供了这方面的托管版本，不再需要团队自行搭建——在自建沙箱之前，应优先考虑使用这些成熟方案。`,
    learningMapEn: `- Understand why code execution has the highest blast radius among agent tools
- Learn 5 non-negotiable sandboxing practices
- Recognize managed sandbox providers as the default choice over rolling your own
- Practice auditing a code-execution tool against this checklist`,
    learningMapZh: `- 理解为何代码执行是智能体工具中破坏半径最大的一类
- 掌握 5 条不可妥协的沙箱实践
- 认识到托管沙箱厂商应作为默认选择，而非自建
- 练习依据本清单审查一个代码执行工具`,
    handsOnEn: `1. Check whether any code-execution tool in your stack runs in-process — if so, flag it as high priority to isolate.
2. Set explicit CPU/memory/timeout limits on a sandboxed execution tool.
3. Confirm the sandbox has no network access by default, then add only the endpoints actually needed.
4. Add logging that captures the full code and output of every execution.`,
    handsOnZh: `1. 检查你技术栈中是否有代码执行工具在进程内直接运行——如果有，标记为高优先级隔离对象。
2. 为一个沙箱化的代码执行工具设定明确的 CPU/内存/超时限制。
3. 确认沙箱默认没有网络访问权限，然后仅添加任务确实需要的端点。
4. 添加日志，记录每次执行的完整代码和输出。`,
    resources: [
      {
        title: "Anthropic — Code execution tool",
        url: "https://docs.claude.com/en/docs/agents-and-tools/tool-use/code-execution-tool",
        description: "Anthropic's managed sandboxed code-execution tool for Claude.",
      },
      {
        title: "OpenAI — Code Interpreter",
        url: "https://platform.openai.com/docs/assistants/tools/code-interpreter",
        description: "OpenAI's equivalent managed sandbox for agent code execution.",
      },
    ],
  },
  {
    order: 17,
    key: "model-context-protocol",
    titleEn: "Model Context Protocol (MCP): Standardizing Tool Access",
    titleZh: "模型上下文协议（MCP）：标准化工具接入",
    category: "mcp",
    summaryEn:
      "MCP is an open protocol, introduced by Anthropic in late 2024, that standardizes how agents discover and call tools/data sources — the USB-C of agent tooling.",
    summaryZh: "MCP 是 Anthropic 于 2024 年底推出的一项开放协议，用于标准化智能体发现和调用工具/数据源的方式——可以理解为智能体工具生态的「USB-C」。",
    tags: ["agentic-ai", "tool-use", "mcp", "deeplearningai"],
    bodyEn: `Before MCP, every agent framework and every integration (Slack, GitHub, a database, a file system) needed its own bespoke connector — an N×M problem where every model/framework combination had to be wired to every tool separately. The Model Context Protocol (MCP), open-sourced by Anthropic in November 2024 and since donated to the Linux Foundation's Agentic AI Foundation, defines a standard client-server protocol for exposing tools, resources, and prompts to any MCP-compatible agent.

The core pieces:

- **MCP servers** expose capabilities — tools (functions the agent can call), resources (data the agent can read), and prompts (reusable prompt templates) — over a standard interface.
- **MCP clients** (built into agent frameworks, IDEs, and apps) connect to any number of servers and present their capabilities to the model uniformly, regardless of which team or company wrote the server.
- Because the protocol is standardized, a server written once (say, a GitHub MCP server) works with any MCP-compatible agent, not just the one it was built for — the same "write once, plug in anywhere" value proposition USB-C offered for hardware.

Practically: if you're building a tool that multiple agents/teams might want to use, building it as an MCP server rather than a one-off function gets you that reuse for free. If you're building an agent, checking whether an MCP server already exists for the system you need to integrate with (there are thousands now) is usually faster than writing a custom tool wrapper.`,
    bodyZh: `在 MCP 出现之前，每一个智能体框架、每一个集成（Slack、GitHub、数据库、文件系统）都需要各自定制的连接器——这是一个 N×M 的问题：每一种"模型/框架"组合都要与每一个工具单独对接。模型上下文协议（MCP）由 Anthropic 于 2024 年 11 月开源，随后捐赠给了 Linux 基金会新成立的 Agentic AI Foundation，它定义了一套标准的客户端—服务器协议，用于向任何兼容 MCP 的智能体暴露工具、资源和 prompt。

其核心组成部分：

- **MCP 服务器（MCP servers）** 通过一个标准接口，对外暴露能力——工具（智能体可调用的函数）、资源（智能体可读取的数据）、以及 prompt（可复用的 prompt 模板）。
- **MCP 客户端（MCP clients）**（内置于各类智能体框架、IDE 和应用中）可以连接任意数量的服务器，并以统一的方式将其能力呈现给模型，无论该服务器是由哪个团队或公司编写的。
- 由于协议是标准化的，一个只编写一次的服务器（比如一个 GitHub MCP 服务器）可以与任何兼容 MCP 的智能体协同工作，而不仅限于最初为其构建的那一个——这与 USB-C 为硬件带来的"一次编写、随处接入"的价值主张如出一辙。

从实践角度看：如果你正在构建一个可能被多个智能体/团队使用的工具，把它构建成一个 MCP 服务器，而不是一次性的函数，就能免费获得这种复用价值。如果你正在构建一个智能体，检查你需要对接的系统是否已经存在现成的 MCP 服务器（目前已有数千个），通常比自己编写一个定制工具封装要快得多。`,
    learningMapEn: `- Understand the N×M integration problem MCP solves
- Learn the client/server model: tools, resources, prompts
- See the "write once, plug in anywhere" reuse value
- Know when to build an MCP server vs. a one-off tool`,
    learningMapZh: `- 理解 MCP 所解决的 N×M 集成问题
- 掌握客户端/服务器模型：工具、资源、prompt
- 理解"一次编写、随处接入"带来的复用价值
- 明确何时应构建 MCP 服务器，何时用一次性工具即可`,
    handsOnEn: `1. Search the MCP ecosystem for a server that already covers a system you need to integrate.
2. Connect an MCP-compatible client/framework to one public MCP server and list its exposed tools.
3. Call one tool from that server and confirm the result flows back into your agent's context.
4. If no server exists for your integration, sketch what one would expose (tools/resources/prompts).`,
    handsOnZh: `1. 在 MCP 生态中搜索是否已有服务器覆盖你需要对接的系统。
2. 用一个兼容 MCP 的客户端/框架连接一个公开的 MCP 服务器，列出它暴露的工具。
3. 调用该服务器的一个工具，确认结果能正确回流到你智能体的上下文中。
4. 如果你需要的集成尚无现成服务器，勾勒出该服务器应当暴露哪些工具/资源/prompt。`,
    resources: [
      {
        title: "Model Context Protocol — official docs",
        url: "https://modelcontextprotocol.io/",
        description: "The protocol specification, SDKs, and a growing directory of MCP servers.",
      },
      {
        title: "Anthropic — Introducing the Model Context Protocol",
        url: "https://www.anthropic.com/news/model-context-protocol",
        description: "The original announcement explaining the motivation and design of MCP.",
      },
    ],
  },
  {
    order: 18,
    key: "retrieval-as-a-tool",
    titleEn: "Retrieval as a Tool: Grounding Agents in Your Own Data",
    titleZh: "把检索当作一种工具：让智能体扎根于你自己的数据",
    category: "skill",
    summaryEn:
      "The clean way to combine RAG with agentic AI is to stop treating retrieval as a fixed pipeline stage and start treating it as just another tool the agent decides to call.",
    summaryZh: "把 RAG 与智能体 AI 结合的干净方式，是不再把检索当作一个固定的流水线阶段，而是把它当作智能体可以自行决定是否调用的又一种工具。",
    tags: ["agentic-ai", "tool-use", "rag", "deeplearningai"],
    bodyEn: `Classic RAG retrieves documents on every query, whether or not they're needed, and stuffs them into context before generation starts. In an agentic system, retrieval becomes a **tool call** the agent chooses to make (or not), potentially multiple times, with different queries, as its understanding of the task evolves.

This reframing unlocks patterns plain RAG can't do:

- **Query reformulation across turns.** The agent can retrieve, notice the results don't answer the real question, and issue a *better* follow-up query — instead of committing to one retrieval pass.
- **Multi-hop retrieval.** Answering "who was the CEO of the company that acquired X" may require retrieving X's acquirer, then retrieving that company's CEO — two dependent retrieval steps, not one.
- **Selective retrieval.** For queries the model can already answer confidently from its own knowledge, it can skip retrieval entirely rather than always paying the latency/cost of a lookup.
- **Combining sources.** The agent can retrieve from a vector store *and* call a SQL tool *and* hit a web-search tool in the same task, choosing per sub-question which source is authoritative.

The trade-off: this gives the agent more room to retrieve badly (wrong query, wrong source, stopping too early) than a fixed pipeline does. Treat retrieval-as-tool the same as any other tool in this module — clear description, structured results, and evaluation of how often the agent's retrieval choices are actually correct.`,
    bodyZh: `传统 RAG 会在每次查询时都进行检索，无论是否真的需要，并在生成开始前把文档塞入上下文。在智能体系统中，检索变成了智能体自行选择（或不选择）调用的**工具调用**，并且可以随着智能体对任务理解的深入，用不同的查询多次调用。

这种重新定义解锁了纯 RAG 做不到的模式：

- **跨轮次的查询重构。** 智能体可以先检索，发现结果并不能回答真正的问题，然后发出一个*更好*的后续查询——而不是只押注于一次检索。
- **多跳检索（Multi-hop retrieval）。** 回答"收购了 X 公司的那家公司的 CEO 是谁"，可能需要先检索出 X 的收购方，再检索该公司的 CEO——这是两个相互依赖的检索步骤，而非一个。
- **选择性检索。** 对于模型凭自身知识已能自信作答的查询，它可以完全跳过检索，而不是每次都为一次查找付出延迟和成本代价。
- **组合多种来源。** 智能体可以在同一个任务中，既从向量库检索，又调用 SQL 工具，还调用网页搜索工具，针对每个子问题自行判断哪个来源更权威。

这种做法的代价是：相比固定流水线，它给了智能体更多"检索得不好"的空间（查询错了、来源错了、停得太早）。应把"检索即工具"与本模块中的其他工具同等对待——清晰的描述、结构化的结果，并评估智能体的检索选择实际正确的比例。`,
    learningMapEn: `- Contrast fixed-pipeline RAG with retrieval-as-a-tool
- Learn 4 patterns unlocked by this reframing: query reformulation, multi-hop, selective, multi-source
- Understand the added failure surface this introduces
- Apply the same evaluation discipline used for other tools`,
    learningMapZh: `- 对比固定流水线式 RAG 与"检索即工具"
- 掌握该重构解锁的 4 种模式：查询重构、多跳、选择性、多来源
- 理解这一做法引入的额外失败面
- 对其应用与其他工具相同的评估纪律`,
    handsOnEn: `1. Turn a fixed RAG retrieval step into a callable tool with a clear name/description.
2. Test a multi-hop question and see whether the agent issues two dependent retrieval calls correctly.
3. Test a question the model can answer from its own knowledge and check whether it skips retrieval.
4. Log 20 retrieval decisions and grade whether the chosen query/source was actually the right one.`,
    handsOnZh: `1. 把一个固定的 RAG 检索步骤改造成一个具有清晰名称/描述的可调用工具。
2. 用一个多跳问题测试，看智能体是否正确发出了两个相互依赖的检索调用。
3. 用一个模型凭自身知识就能回答的问题测试，检查它是否跳过了检索。
4. 记录 20 次检索决策，评估所选查询/来源是否确实正确。`,
    resources: [
      {
        title: "Anthropic — Building Effective Agents",
        url: "https://www.anthropic.com/engineering/building-effective-agents",
        description: "Discusses retrieval and other augmentations as tools within an agentic loop.",
      },
      {
        title: "ReAct: Synergizing Reasoning and Acting in Language Models",
        url: "https://arxiv.org/abs/2210.03629",
        description: "Originating paper for interleaving retrieval-style actions with reasoning, multi-hop included.",
      },
    ],
  },
];
