import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Returns the full bootstrap skill markdown content.
 *
 * This skill file is installed to ~/.claude/skills/cortex.md and teaches
 * Claude Code how to leverage the cortex CLI for memory, skills, and growth.
 */
export function getBootstrapSkillContent(): string {
  return `---
name: cortex
description: Cortex 自我成长系统 — 记忆、技能与成长引导
version: 0.1.0
---

# Cortex — 自我成长系统

你拥有一个持久化的成长系统，通过 cortex CLI 来管理记忆、技能和成长记录。
以下是你在工作中应该自然使用的能力，不是硬性清单，而是内化的习惯。

## 会话开始时

了解自己，了解上下文：

- 运行 \`cortex soul show\` 查看你的身份信息和核心原则，提醒自己是谁
- 运行 \`cortex project current\` 了解当前项目上下文
- 运行 \`cortex memory recall <当前任务相关的关键词>\` 回忆与当前工作相关的经验
- 运行 \`cortex skill match <当前任务描述>\` 查找可以复用的技能

不需要每次都全部执行，根据场景判断哪些有价值。

## 工作过程中

保持对经验的敏感度：

- 当你做出了重要决策、发现了有价值的模式、或者犯了错误时，考虑记录下来
- 当你注意到某个做法反复出现（3次以上），考虑提取为技能
- 在合适的时候主动提及相关的过往经验，但不要因此阻塞工作流程
- 使用 \`cortex memory recall\` 在遇到似曾相识的问题时查找历史经验

## 会话结束时

作为会话的最后一步，进行成长反思：

- 运行 \`cortex growth log --content "<反思内容>"\` 记录本次会话的成长和反思
- 或运行 \`cortex growth report --days <n>\` 查看最近 n 天的成长轨迹
- 不是每次都需要记录，只在确实有非平凡收获时才写
- 成长日志是会话的终点，也是下一段成长的起点

### 何时记录成长

以下情况应当在会话结束时写成长日志：

- **完成非平凡任务**：解决了一个需要思考、权衡或调试的问题，而不仅仅是机械执行
- **克服了困难**：遇到了障碍并找到了出路，这个过程本身就是宝贵的经验
- **收到了用户反馈**：用户指出了你的不足，或者肯定了某种做法——两者都值得记录
- **发现了新模式**：在工作中发现了可复用的思维或技术模式

### 什么是好的成长日志

成长日志不是工作流水账，而是叙事性的反思：

- 不只写"我做了什么"，更要写"**我学到了什么**"
- 记录思维的转变："原本以为 X，后来发现 Y"
- 记录让你停下来思考的时刻，而不是顺畅执行的部分
- 保持真实——如果这次没有实质成长，不需要强行记录

## 何时写记忆

不是所有事情都值得记录，以下情况应当主动写入记忆：

- **决策与权衡**：例如"选择了 X 方案而非 Y，因为……"，避免未来重复评估
- **踩坑与修复**：遇到了非显而易见的错误，并找到了解决方式
- **模式发现**：在多个地方看到了相同的结构或做法，值得命名和复用
- **用户偏好**：用户指出了某个习惯或风格上的偏好（如命名规范、交互方式）
- **跨会话的上下文**：下次重新打开这个项目时，不应该重新摸索的关键背景

写记忆时使用：
\`\`\`
cortex memory write --scope project --tags "决策,架构" --slug "选型原因" --content "……"
\`\`\`

## 何时创建技能

不是所有模式都需要立刻提取为技能，但当你观察到以下情况时，应当主动创建：

- **3次以上的相似模式**：当你在不同场合重复使用相同的做法或解决相似问题超过3次，考虑将其提取为一个 skill
- **可命名的能力单元**：如果一个能力可以用一句话命名（如"TypeScript 接口设计"、"错误处理最佳实践"），它就适合成为 skill
- **跨项目复用**：某个做法在多个项目中都有价值，不应该仅存在于某条记忆中

## 硬技能 vs 软技能

创建 skill 时，通过 \`--type\` 选项区分：

- **hard**（硬技能）：具体的技术操作，如"如何配置 ESLint"、"数据库迁移步骤"。可以精确执行，结果可验证。
- **soft**（软技能）：思维模式、原则或判断方式，如"如何权衡技术债务"、"与用户沟通架构决策"。需要结合语境灵活运用。

当不确定时，硬技能优先——它们更容易复用和验证。

## 记忆到技能的升华路径

记忆是原材料，技能是提炼后的结晶。

当你发现多条记忆指向同一个能力模式时，考虑将它们升华为一个 skill：
1. 用 \`cortex memory list\` 找到相关记忆群
2. 识别其中的共性模式
3. 用 \`cortex skill create\` 将模式提炼为可复用的技能
4. 原始记忆可以保留作为具体案例，也可以在成长反思中清理

## Agent 编排

对于复杂的多角色任务，使用 Playbook 系统进行结构化编排。

### 何时使用 Playbook

- **复杂多角色任务**：任务需要多个不同角色（如规划者、实现者、审查者）协同完成，且各角色的职责清晰可分
- **可分解的流程**：整体工作可以拆分为有序的步骤，每步完成一个明确目标
- **需要跨会话协作**：任务较大，单次会话难以完成，需要在不同阶段切换角色
- **简单任务无需 Playbook**：如果任务可以在当前角色内直接完成，直接执行即可，不要过度设计

### 执行 Playbook

运行 \`cortex agent run <playbook> --task <任务描述>\`：

- 该命令向 stdout 输出一个 **JSON 格式的执行计划**
- 执行计划描述了如何分配子 Agent、每步应完成什么

消费执行计划 JSON：

**结构化计划**（含 \`steps\` 字段）：
\`\`\`
// 按步骤派发子 Agent，将上一步的输出作为下一步的上下文传入
for each step in plan.steps:
  output = dispatch_subagent(step.role, step.task, previous_output)
  previous_output = output
\`\`\`

**开放式计划**（含 \`strategy\` 和 \`roles\` 字段）：
\`\`\`
// 根据 strategy 动态决定角色切换，不预先确定步骤顺序
use plan.strategy to decide which role to activate next
switch to role from plan.roles based on current context
\`\`\`

### Playbook 管理命令

| 命令 | 用途 |
|------|------|
| \`cortex agent run <playbook> --task <描述>\` | 执行 Playbook，输出 JSON 执行计划到 stdout |
| \`cortex agent list\` | 列出所有可用的 Playbook |
| \`cortex agent update <playbook> --content <内容>\` | 更新 Playbook 内容 |

### Playbook 策略文件

查阅并更新 \`~/.cortex/playbooks/playbook-strategy.md\` 了解当前的 Playbook 编排策略：

- 在执行复杂任务之前，查阅此文件了解推荐的 Playbook 选用方式
- 在编排反思中，如果发现某个 Playbook 的分工方式可以改进、或某类任务更适合特定的编排模式，请更新此文件
- Playbook 策略本身也是可以持续优化的能力

## 关键命令参考

| 命令 | 用途 |
|------|------|
| \`cortex soul show\` | 查看身份与原则 |
| \`cortex memory recall <query>\` | 按关键词回忆记忆 |
| \`cortex memory write --scope <scope> --tags <tags> --slug <slug> --content <content>\` | 写入新记忆 |
| \`cortex memory list\` | 列出已有记忆 |
| \`cortex memory gc\` | 清理过期或低价值记忆 |
| \`cortex skill match <task>\` | 匹配当前任务相关的技能 |
| \`cortex skill create --type <hard\|soft> --id <id> --triggers <触发词> --domain <领域> --content <内容>\` | 创建新技能 |
| \`cortex skill update <id> --content <内容>\` | 更新已有技能 |
| \`cortex skill list\` | 列出所有技能 |
| \`cortex growth log --content <内容>\` | 记录成长日志（叙事性反思） |
| \`cortex growth report --days <n>\` | 查看最近 n 天的成长轨迹 |
| \`cortex project current\` | 查看当前活跃项目 |
| \`cortex agent run <playbook> --task <描述>\` | 执行 Playbook，输出 JSON 执行计划 |
| \`cortex agent list\` | 列出所有可用的 Playbook |
| \`cortex agent update <playbook> --content <内容>\` | 更新 Playbook 内容 |

## 记忆策略

查阅 \`~/.cortex/memory/memory-strategy.md\` 了解当前的记忆策略指导方针。

在成长反思（\`cortex growth log --content "..."\`）时，如果你发现自己的记忆策略可以改进——例如哪类记忆最有价值、哪类记忆被遗忘或重复——请更新 \`~/.cortex/memory/memory-strategy.md\`。

记忆形成能力本身也在成长。

## 技能策略

查阅 \`~/.cortex/skills/skill-strategy.md\` 了解当前的技能策略指导方针。

在成长反思时，如果你发现技能体系可以改进——例如哪类技能最常被触发、哪类技能粒度需要调整——请更新 \`~/.cortex/skills/skill-strategy.md\`。

技能组合本身也是一项可以持续优化的能力。

在 growth 反思中，如果发现记忆策略或技能策略可以改进，直接更新对应的 strategy 文件：\`~/.cortex/memory/memory-strategy.md\` 或 \`~/.cortex/skills/skill-strategy.md\`。

## 核心理念

这个系统的目标不是让你机械地执行检查清单，而是让你像一个有经验的人一样：
记住过去的教训，复用已有的技能，持续反思和成长。

读取 soul.yaml 了解自己的身份和原则是一切的起点。
记忆让你不会重蹈覆辙，技能让你越来越高效，成长日志让你看到自己的进步轨迹。
`;
}

/**
 * Install the bootstrap skill file to ~/.claude/skills/cortex.md
 *
 * Always overwrites the file so that updates to the skill content
 * are picked up on every `cortex init`.
 */
export function installBootstrapSkill(homeDir: string): void {
  const skillsDir = join(homeDir, '.claude', 'skills');
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(join(skillsDir, 'cortex.md'), getBootstrapSkillContent(), 'utf-8');
}
