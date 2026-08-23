# zdsh-autopilot

**zDSH AutoPilot（自动领航）** —— DeepSeek Harness 的统一自动化引擎插件。三合一能力，共享一个内核与一个控制台：

| 模块 | 功能 |
|---|---|
| **续跑（断线自愈）** | 识别非人为打断（网络错误、max-tokens 等），自动发送续跑提示；自适应退避、幂等护栏、循环守卫 |
| **守卫（沙箱优先自动审批）** | 沙箱优先的权限策略：例行工作在 OS 沙箱内零打扰直行；语义风险交脱敏后的 LLM 分类器；越权走一次性最小授权 |
| **复核（二模型审批复核）** | 只读第二模型复核子代理应答审批请求，默认 fail-closed，带双预算、熔断器与全会话日志审计 |

三者共享：统一审计词汇（`ap/*` 会话事件）、跨模块协调（有待批审批时挂起自动续跑；复核熔断时抑制续跑）、一个设置页、一个 `/ap` 命令面、内置离线行为评测。

> **状态：活跃开发中（v0.1.0-alpha）。** 本项目为净室实现——仅借鉴社区设计思想，零社区代码。

## 安装

```bash
dsh plugin --profile web add github:zsagi1368/zdsh-autopilot
# 或本地检出：
dsh plugin --profile web add link:<本仓库路径>
```

要求 DSH `>=0.1.0-rc.2`（上游官方与 zDSH 增强分支均可安装）。

## 开发

```bash
pnpm install
pnpm ci        # lint + typecheck + test + build
pnpm eval      # 离线行为契约套件（无需真实 API key）
```

架构：`src/kernel/*`（共享内核）+ `src/{continue,guard,review}` 能力模块 + `src/client` 控制台半身。模块边界由 CI 强制（`scripts/check-boundaries.mjs`）。

## 许可证

MIT © 2026 zsagi1368。独立净室实现，设计来源声明见 `docs/DESIGN.md`（撰写中）。
