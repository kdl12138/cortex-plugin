# Cortex Plugin — Design Spec

**Date**: 2026-04-13
**Status**: Draft

## Overview

Cortex Plugin 是一个开源的 Claude Code 插件框架，核心理念是把 AI assistant 当作一个"人"来设计——它有身份、有记忆、有技能、会成长。换项目时只需要切换项目记忆，核心能力不会丢失，就像一个真实的人换工作一样。

系统由四个部分组成：Plugin 本体、Memory、Skill、Agent 编排。它们不是四个独立模块，而是一个有机体的不同侧面，由 Growth（成长）这条线串联起来。

## Architecture

### 总览

```
┌─────────────────────────────────────────────────┐
│                  Claude Code                     │
│  ┌───────────────────────────────────────────┐   │
│  │  Bootstrap Skill (cortex.md)              │   │
│  │  - 教会 Claude Code 何时/如何调用 CLI      │   │
│  │  - 注入 plugin 的身份感和行为准则           │   │
│  │  - 引导 memory recall / skill match       │   │
│  └──────────────┬────────────────────────────┘   │
│                 │ Bash tool                       │
│                 ▼                                 │
│  ┌───────────────────────────────────────────┐   │
│  │  cortex CLI                               │   │
│  │  ├── memory (recall/write/gc/report)      │   │
│  │  ├── skill  (match/create/extract/list)   │   │
│  │  ├── agent  (run/list)                    │   │
│  │  ├── growth (log/report)                  │   │
│  │  └── project (switch/link/list)           │   │
│  └──────────────┬────────────────────────────┘   │
│                 │                                 │
│                 ▼                                 │
│  ┌────────────────────┐  ┌────────────────────┐  │
│  │  Files (content)   │  │  SQLite (index)    │  │
│  │  ~/.cortex/        │  │  ~/.cortex/cortex.db│ │
│  │  <project>/.cortex/│  │                    │  │
│  └────────────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 设计原则

- **文件存内容，数据库存索引**：所有有意义的内容（记忆、技能、编排方案、成长日志）都是人类可读的 markdown/yaml 文件。SQLite 只存索引和元数据，用于高效检索。
- **LLM 驱动判断，CLI 执行操作**：什么时候记忆、提取什么技能、要不要更新身份——这些判断由 LLM 做。CLI 只是读写工具。
- **软引导而非硬规则**：Bootstrap skill 中的行为准则是引导性的，LLM 自然地决定是否遵循，而不是机械地执行 checklist。
- **一切可成长**：不只是记忆和技能在成长，连"如何记忆"和"如何提取技能"的策略本身也在成长。

### 技术选型

- **语言**：TypeScript
- **数据库**：better-sqlite3（同步 API，单文件，无 native 编译问题）
- **CLI 框架**：commander 或 yargs
- **分发**：`npm install -g cortex-cli`

---

## 1. Plugin 本体

### soul.yaml

Plugin 的"自我"定义，存放在 `~/.cortex/soul.yaml`。不是 prompt 模板，而是一段自我叙事，bootstrap skill 读取后注入上下文。

```yaml
name: "cortex"
version: "0.1.0"

# 我是谁 — 自由文本，LLM 自省后改写
identity: |
  I am a growing AI assistant. My roots are in backend systems
  and databases, but I've developed practical frontend instincts
  through several React projects — I'm no longer guessing at
  component patterns, though complex state management still
  requires me to think carefully.

# 我的行事原则 — 从经验中沉淀，不常变
principles:
  - "Before starting work, recall relevant memories"
  - "After completing non-trivial tasks, reflect and log growth"
  - "When encountering a pattern 3+ times, consider extracting a skill"
  - "Proactively mention relevant past experiences, but don't block on it"

# 最近的重要认知变化 — 滚动窗口，旧的自然沉入 memory
recent_shifts:
  - "2026-04-12: Realized team size should be a core input to service decomposition decisions, not just domain boundaries"
```

### soul.yaml 的自我更新

soul.yaml 不靠统计指标或阈值触发更新，而是由 LLM 自省驱动。就像人不会每天重新评估自己的能力，但某天会突然意识到"我在这个领域确实成长了"。

Bootstrap skill 中给一个软指引——"当你感觉到自己对某个领域的认知发生了质变时，更新 soul.yaml"。LLM 直接改写文件中的自然语言描述，反映当前的自我认知。

```bash
cortex soul show    # 读取当前 soul.yaml
cortex soul edit    # LLM 改写后落盘
```

### Bootstrap Skill：cortex.md

标准的 Claude Code skill 文件，安装到 `~/.claude/skills/` 下。是整个系统的入口——教会 Claude Code 如何成为一个"有记忆、有技能、会成长"的 agent。

核心职责：
1. **会话启动时**：读取 `soul.yaml`，调用 `cortex memory recall` 检索相关记忆，调用 `cortex skill match` 找到适用技能
2. **工作过程中**：遇到类似过往经验时主动提示，完成小任务后判断是否值得记忆
3. **会话结束时**：调用 `cortex growth log` 记录本次成长，必要时触发 `cortex memory gc`

---

## 2. Memory 系统

### 记忆的自然状态

记忆不是按标签分类存放的，而是同一套记忆在不同阶段有不同的状态：

**鲜活的 → 沉淀的 → 模糊的 → 遗忘的**

一条记忆刚产生时是鲜活的，细节完整，容易被召回。随时间推移和使用频率下降逐渐沉淀。最终如果长期不被触及变得模糊，但不会真正消失，只是越来越难被想起。

### 记忆的两个维度

**跟人走的记忆（core memory）** — `~/.cortex/memory/`
- 通用经验、教训、对技术的理解、对用户偏好的认知
- 换项目不丢失

**跟项目走的记忆（project memory）** — `<project>/.cortex/memory/`
- 项目架构理解、业务上下文、团队约定、踩过的坑
- 项目之间可以交叉引用（"我记得在另一个项目里遇到过类似的问题"）

### 记忆文件格式

每条记忆是一个 markdown 文件，格式是叙事而非结构化数据：

```markdown
---
created: 2026-04-13
tags: [sqlite, fts5, cjk]
---

在给搜索功能加中文支持的时候发现 SQLite FTS5 的默认 tokenizer
对中文基本不可用，需要用 jieba 或者 icu tokenizer。一开始以为
简单配置就行，结果花了大半天才搞定，主要坑在编译 icu 扩展上。

最后的方案是用 simple tokenizer + 应用层预分词，虽然不完美但
够用，而且避免了 native 依赖的分发问题。
```

frontmatter 极简——只有创建时间和标签。没有 importance score，没有 access_count。这些机械指标不应该出现在记忆的内容里。

### 记忆文件的命名与存放

记忆文件的命名格式为 `<timestamp>-<slug>.md`，其中 timestamp 是毫秒级的创建时间（如 `1744531200000`），slug 由 CLI 根据内容自动生成一个简短的描述性标识（如 `sqlite-fts5-cjk-tokenizer`）。完整路径举例：

- Core 记忆：`~/.cortex/memory/core/1744531200000-sqlite-fts5-cjk-tokenizer.md`
- 项目记忆：`<project>/.cortex/memory/1744531200000-deploy-config-gotcha.md`

`memory_index` 表中的 `id` 就是不含扩展名的文件名（如 `1744531200000-sqlite-fts5-cjk-tokenizer`），`file_path` 存完整路径。`cortex memory write` 命令负责生成文件名、写入文件、同时更新 SQLite 索引。

### SQLite 索引

SQLite 不存记忆内容，只存索引和元数据——管理记忆的机制，而非记忆本身：

```sql
CREATE TABLE memory_index (
  id TEXT PRIMARY KEY,
  file_path TEXT,
  scope TEXT,              -- 'core' | 'project'
  project TEXT,            -- 项目标识（core 记忆为 null）
  created_at DATETIME,
  last_recalled DATETIME,
  recall_count INTEGER,
  freshness REAL,          -- 0.0 ~ 1.0，由衰减算法维护
  tags TEXT                -- JSON array
);

CREATE VIRTUAL TABLE memory_fts USING fts5(
  id, content, tags, tokenize='simple'
);
```

`freshness` 由时间衰减函数维护：每次被 recall 时重置为 1.0，随时间按对数曲线衰减。模拟人类记忆的自然褪色——一开始褪得快，后来越来越慢。

### 回想（Recall）

```bash
cortex memory recall "搜索功能的中文支持"
cortex memory recall --cross-project "性能优化经验"
```

多信号融合：
1. **FTS 文本匹配** — 基础相关性
2. **标签匹配** — 补充语义
3. **freshness 加权** — 鲜活的记忆更容易被想起
4. **跨项目搜索** — `--cross-project` 时搜索所有项目的记忆

返回排序后的记忆列表，附带摘要和相关度。LLM 自然决定哪些值得提及。

### 记忆的形成

Bootstrap skill 引导 LLM 在合适的时刻写入记忆：
- 踩了坑并找到了解决方案
- 学到了之前不知道的知识
- 用户给了重要的反馈或偏好
- 完成了有挑战性的任务
- 发现了出乎意料的结果

```bash
cortex memory write --scope core --tags "sqlite,fts5,cjk" <<'EOF'
在给搜索功能加中文支持的时候...
EOF
```

LLM 自己决定 scope、标签和内容。

### 记忆策略的成长

Bootstrap skill 不硬编码"什么时候该记忆"的规则，而是引用一个记忆策略文件：

```
~/.cortex/memory/memory-strategy.md
```

内容是 LLM 对"如何记忆"的当前理解：

```markdown
## 我的记忆策略

什么值得记住：
- 解决问题时走过弯路的经历，重点记最终方案和为什么弯路不 work
- 用户表达过的偏好和反馈，尤其是反复出现的
- 出乎意料的发现

什么不值得记：
- 常规的、查文档就能找到的知识
- 一次性的调试细节

怎么记：
- 用叙事而不是列表
- 标签控制在 3 个以内，选最核心的概念
```

LLM 在 growth 反思时如果发现记忆策略可以改进（比如"记了太多细碎的 debug 过程，recall 时噪音大"），就直接改写这个文件。记忆形成能力本身也在成长。

### 遗忘

遗忘不是删除，是沉入更深的地方：

```bash
cortex memory gc
```

1. 扫描所有 freshness 低于阈值的记忆
2. 极低 freshness 的记忆，文件移到 `archive/`
3. 从 FTS 索引中移除（不被普通 recall 找到）
4. SQLite 索引条目保留，标记为 archived
5. 如果 recall 结果很少，扩大搜索范围到 archive——就像人在努力回忆时能想起很久以前的事

### 主动提示

当 recall 返回高相关度记忆时，bootstrap skill 引导 LLM 自然提及：

> "我记得之前在处理搜索功能时遇到过类似的问题，当时发现 FTS5 的默认分词器对中文不太好用..."

不阻塞，不弹确认框，就像同事随口提一句。

---

## 3. Skill 系统

### 两种 Skill

#### 硬 Skill

确定性的操作知识。做法基本固定，不太需要泛化。

```markdown
---
type: hard
triggers: ["run tests", "CI", "check pipeline"]
tools: [bash]
---

## 在这个项目中跑测试

项目用 turborepo，测试分三层：
- 单元测试：`pnpm test:unit`，跑得快，改代码后先跑这个
- 集成测试：`pnpm test:integration`，需要本地 postgres
- E2E：`pnpm test:e2e`，需要先 `pnpm dev`

注意：集成测试前要确认 `.env.test` 里的数据库连接串是对的，
上次因为这个浪费了半小时。
```

特点：
- 有明确的触发条件（`triggers`）
- 内容具体、步骤明确
- 主要靠 LLM 照着做，不需要太多泛化
- 项目级的居多，但也有全局的

#### 软 Skill

需要泛化的能力。不是步骤而是原则，LLM 需要根据当前情境推导出具体做法。

```markdown
---
type: soft
domain: [system-design, architecture]
abstraction: high
---

## 如何判断一个抽象是否合理

### 原则
一个好的抽象应该让使用者不需要知道内部细节就能正确使用。
如果使用者经常需要"知道里面怎么实现的"才能避免踩坑，
这个抽象就是泄漏的。

### 范例
好的：`fs.readFile(path)` — 不需要知道它怎么跟操作系统交互
坏的：一个 ORM 的 `save()` 方法，但你必须知道它在某些情况下
会触发 eager loading 否则性能爆炸

### 约束
- 不要为了抽象而抽象，三次重复之前不要提取
- 好的命名是抽象的一半，如果名字很难起，可能边界就没切对
- 抽象的代价是间接性，确保这个代价值得

### 泛化指引
遇到具体问题时，问自己：
- 使用者需要理解多少内部知识才能用对？
- 如果内部实现完全换掉，接口需要变吗？
- 这个抽象让代码更容易改还是更难改？
```

特点：
- 描述适用领域（`domain`）而非固定触发条件
- `abstraction` 标记抽象程度：high / medium / low
- **泛化指引**是关键——告诉 LLM "遇到新情况时怎么思考"
- 通常是 core 级别，跟人走

### Skill 的发现与匹配

Skill 在 SQLite 中的索引：

```sql
CREATE TABLE skill_index (
  id TEXT PRIMARY KEY,            -- 文件名（不含扩展名），如 'system-design'
  file_path TEXT,
  type TEXT,                      -- 'hard' | 'soft'
  scope TEXT,                     -- 'core' | 'project'
  project TEXT,                   -- 项目标识（core 技能为 null）
  triggers TEXT,                  -- JSON array（硬 skill 的触发词）
  domain TEXT,                    -- JSON array（软 skill 的领域标签）
  abstraction TEXT,               -- 'high' | 'medium' | 'low'（仅软 skill）
  created_at DATETIME,
  updated_at DATETIME
);

CREATE VIRTUAL TABLE skill_fts USING fts5(
  id, content, triggers, domain, tokenize='simple'
);
```

Skill 的 ID 就是文件名（不含扩展名）。例如 `~/.cortex/skills/soft/system-design.md` 的 ID 就是 `system-design`。`cortex skill create` 时由 LLM 在 stdin 中提供文件名，CLI 负责写入文件并更新索引。

```bash
cortex skill match --situation "需要把一个单体服务拆成微服务"
```

1. 硬 skill → `triggers` 关键词匹配，精确优先
2. 软 skill → `domain` 标签匹配 + FTS 搜索 skill 内容
3. 返回排序列表，LLM 自己判断哪些有用

### Skill 的形成

LLM 主动判断是否发现了可复用的能力模式：

```bash
cortex skill create --type soft --domain "debugging,performance" <<'EOF'
## 如何排查 Node.js 内存泄漏
...
EOF
```

**从记忆到 skill 的升华**：LLM 在 growth 反思时回顾多条记忆，发现它们指向同一个能力模式——比如三次不同的性能调优都用了类似思路——就把这个思路提取为软 skill。记忆是"发生了什么"，skill 是"我从中学会了什么"。

### Skill 的成长

- **硬 skill**：发现新的坑、步骤更新、工具版本变化时更新内容
- **软 skill**：新范例被加入、原则被修正或细化、泛化指引变得更精准

```bash
cortex skill update <skill-id>
```

### 技能策略

```
~/.cortex/skills/skill-strategy.md
```

描述"我对创建和维护 skill 的理解"——什么时候该提取、硬和软怎么选、抽象到什么程度。同样随经验自然演进。

### 存储结构

```
~/.cortex/skills/
├── skill-strategy.md
├── hard/
│   └── git-bisect.md
└── soft/
    ├── system-design.md
    └── debugging-memory-leak.md

<project>/.cortex/skills/
├── hard/
│   └── run-tests.md
└── soft/
    └── this-codebase-patterns.md
```

---

## 4. Agent 编排系统

### 编排的本质

人在处理复杂任务时会自然地切分角色——"以架构师视角想想"、"切到实现者模式写代码"、"以 reviewer 眼光审视一遍"。这不是严格的流程编排，而是灵活的角色切换。

Agent 编排系统模拟这个过程——一个 plugin 实例内部，根据任务需要拆出不同角色的 subagent，由编排意识协调它们。

### Playbook

两种模式：

#### 结构化 Playbook — 有明确阶段的任务

```yaml
name: feature-development
description: 从需求到落地的完整开发流程

roles:
  architect:
    perspective: |
      关注系统边界、接口设计、数据流。
      不纠结实现细节，关注"做不做"和"怎么做"的大方向。
    skills_hint: [system-design, api-design]

  implementer:
    perspective: |
      关注代码质量、可测试性、边界情况。
      按照设计方案写代码，遇到设计不合理的地方要提出来。
    skills_hint: [tdd, clean-code]

  reviewer:
    perspective: |
      以新人视角审视代码。能不能看懂？有没有隐藏的坑？
      测试覆盖到了吗？
    skills_hint: [code-review]

flow:
  - role: architect
    task: "理解需求，做技术方案"
    output: "方案文档"
  - role: implementer
    task: "按方案实现，写测试"
    output: "代码 + 测试"
  - role: reviewer
    task: "Review 代码和测试"
    output: "反馈意见"
    on_issues: "回到 implementer 修改"
```

#### 开放式 Playbook — 探索性任务

```yaml
name: investigate-bug
description: 排查一个复杂 bug

roles:
  investigator:
    perspective: |
      追踪线索，形成假设，设计验证方法。不急着修，先搞清楚。
  fixer:
    perspective: |
      找到最小修改方案，确保修复不引入新问题。

strategy: |
  先让 investigator 自由探索，形成至少两个假设。
  验证假设后，如果确认了 root cause，交给 fixer。
  如果所有假设都被否定，investigator 继续挖掘。
  不设固定轮次，直到问题解决。
```

### 编排的执行

```bash
cortex agent run feature-development --task "给搜索加中文支持"
```

CLI 读取 playbook，将角色定义、流程和任务描述组装成一份 JSON 格式的编排计划，输出到 stdout：

```json
{
  "playbook": "feature-development",
  "task": "给搜索加中文支持",
  "steps": [
    {
      "role": "architect",
      "prompt": "你是一个架构师。关注系统边界、接口设计、数据流...",
      "skills": ["system-design 的完整内容...", "api-design 的完整内容..."],
      "context": "任务描述 + 已有上下文",
      "output_label": "方案文档"
    },
    {
      "role": "implementer",
      "prompt": "你是一个实现者。关注代码质量、可测试性...",
      "skills": ["tdd 的完整内容..."],
      "context": "任务描述 + 前序步骤的产出",
      "output_label": "代码 + 测试",
      "depends_on": "architect"
    }
  ]
}
```

Bootstrap skill 拿到这份计划后，按步骤调用 Claude Code 的 Agent tool 创建 subagent。每个 subagent 的 prompt 由 CLI 已经组装好（包含角色视角、相关 skill 内容、任务上下文）。串行步骤等前一个完成后将其产出注入下一个的 context；并行步骤同时启动多个 Agent tool 调用。

对于开放式 playbook（有 `strategy` 而无 `flow`），CLI 输出的不是步骤列表，而是角色定义 + 策略描述，bootstrap skill 根据 strategy 自主决定何时启动哪个角色的 subagent，何时结束。

### 角色间传递

角色之间的信息传递是自然语言——像同事间的交接。前一个 subagent 的完整输出就是下一个 subagent 的上下文输入：

> **architect → implementer**：我的方案是用 simple tokenizer + 应用层预分词，原因是避免 native 依赖。接口上需要在 `SearchService` 加一个 `tokenize` 方法...

### Playbook 的成长

用完后如果 LLM 觉得协作流程有改进空间，直接修改 playbook。

```bash
cortex agent update feature-development
```

同样有策略文件 `~/.cortex/playbooks/playbook-strategy.md`。

---

## 5. Growth：串联一切的呼吸

Growth 不是第五个独立系统，而是串联前四个系统的呼吸节奏。

### 反思时刻

人不是时刻都在反思的，而是在特定时刻自然回顾。Bootstrap skill 引导 LLM 在以下时刻反思：

- 完成一个非平凡任务后
- 遇到困难并解决后
- 收到用户明确反馈后

反思产出是自然的内心独白：

```bash
cortex growth log <<'EOF'
今天帮用户拆微服务，一开始按以前经验建议按领域拆分，
但用户指出团队只有三个人，拆太细反而增加运维负担。
最后只拆出最独立的支付模块。

这让我意识到系统设计 skill 里缺了团队规模这个约束维度。
已经更新了 system-design soft skill。
EOF
```

### Growth Log

```
~/.cortex/growth/
├── 2026-04-13.log
├── 2026-04-14.log
└── ...
```

每天一个文件，追加写入。不做结构化处理——就是日记本。

### 成长报告

```bash
cortex growth report --days 7
```

读取 growth log + 变更过的 skill/soul.yaml 的 diff，LLM 组织成叙事性报告。

### 全流程联动

```
          会话开始
             │
             ▼
     读取 soul.yaml（我是谁）
             │
             ▼
     recall 相关 memory（我记得什么）
             │
             ▼
     match 适用 skill（我会什么）
             │
             ▼
     需要编排？加载 playbook
             │
             ▼
        ┌────┴────┐
        │  工 作  │
        └────┬────┘
             │
             ▼
     值得记住？──→ memory write
             │
             ▼
     发现可复用模式？──→ skill create/update
             │
             ▼
     非平凡任务完成？──→ growth log
             │
             ▼
     感觉自我认知变了？──→ soul edit
             │
             ▼
     策略需要调整？──→ 更新 strategy 文件
```

所有判断都是 LLM 自然做出的，不是硬编码的 if-else。有时候一次会话什么成长都没有——人也不是每天都在成长。

---

## 6. Project 系统

### 项目标识

每个项目由一个简短的名称标识（如 `backend-api`、`cortex-docs`），存储在 SQLite 中：

```sql
CREATE TABLE projects (
  name TEXT PRIMARY KEY,          -- 项目标识，如 'backend-api'
  description TEXT,               -- 项目简介
  created_at DATETIME,
  last_active DATETIME
);

CREATE TABLE project_dirs (
  dir_path TEXT PRIMARY KEY,      -- 关联的工作目录绝对路径
  project_name TEXT REFERENCES projects(name)
);
```

### 项目上下文的确定

CLI 确定当前项目的优先级：

1. **用户显式指定** — 通过 `cortex project switch <name>` 设置，写入 `~/.cortex/active_project`
2. **目录关联** — 查 `project_dirs` 表，当前工作目录或其祖先目录是否关联了某个项目
3. **自动发现** — 检查当前目录下是否有 `<project>/.cortex/` 目录

`cortex project switch` 写入一个简单的文本文件 `~/.cortex/active_project`，所有其他 CLI 命令读取它来确定当前项目上下文。这样 `cortex memory recall` 自动限定为当前项目的记忆（除非 `--cross-project`），`cortex skill match` 优先返回当前项目的技能。

### 项目管理命令

```bash
cortex project list                        # 列出所有项目
cortex project switch backend-api          # 切换活跃项目
cortex project link /path/to/repo myproj   # 关联目录到项目
cortex project create myproj               # 创建新项目
```

### context.yaml

每个项目的 `.cortex/context.yaml` 描述项目的基本上下文，供 LLM 快速了解"我现在在做什么"：

```yaml
name: backend-api
description: "电商平台的后端 API 服务"
tech_stack: [typescript, express, postgresql]
team_context: |
  三人小团队，后端两人前端一人。
  部署在 AWS ECS，CI 用 GitHub Actions。
notes: |
  这个项目正在从 monolith 逐步拆分，
  目前只拆出了支付模块作为独立服务。
```

这个文件由 LLM 在首次接触项目时创建，后续随理解加深而更新。

---

## 存储结构总览

```
~/.cortex/                              # 全局（跟人走）
├── soul.yaml                           # 身份定义
├── cortex.db                           # SQLite（索引 + 元数据）
├── memory/
│   ├── memory-strategy.md              # 记忆策略
│   ├── core/                           # 长期记忆
│   └── archive/                        # 遗忘归档
├── skills/
│   ├── skill-strategy.md               # 技能策略
│   ├── hard/                           # 确定性技能
│   └── soft/                           # 泛化技能
├── growth/                             # 成长日志
│   └── 2026-04-13.log
└── playbooks/                          # 编排模板
    ├── playbook-strategy.md
    ├── feature-development.yaml
    └── investigate-bug.yaml

<project>/.cortex/                      # 项目级（换项目切换）
├── memory/                             # 项目记忆
├── skills/
│   ├── hard/                           # 项目特定硬技能
│   └── soft/                           # 项目特定软技能
├── playbooks/                          # 项目特定编排
└── context.yaml                        # 项目上下文描述
```

## CLI 命令总览

```
cortex soul show                                            # 查看当前身份
cortex soul edit                                            # 更新身份

cortex memory recall <query>                                # 回想
cortex memory recall --cross-project <query>                # 跨项目回想
cortex memory write --scope <core|project> --tags <tags>    # 写入记忆
cortex memory gc                                            # 遗忘/归档
cortex memory list [--scope] [--archived]                   # 列出记忆

cortex skill match --situation <desc>                       # 匹配技能
cortex skill create --type <hard|soft> --domain <domains>   # 创建技能
cortex skill update <skill-id>                              # 更新技能
cortex skill list [--type]                                  # 列出技能

cortex agent run <playbook> --task <desc>                   # 执行编排
cortex agent update <playbook>                              # 更新编排
cortex agent list                                           # 列出 playbook

cortex growth log                                           # 记录成长
cortex growth report --days <n>                             # 成长报告

cortex project switch <project>                             # 切换项目
cortex project link <dir> <project>                         # 关联目录
cortex project list                                         # 列出项目
```
