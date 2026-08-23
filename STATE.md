# STATE — zdsh-autopilot 战役看板

> 恢复会话先读本文件。规划全文：`../plan/00-overview.md`（00–07）。本仓库 = 独立插件 `github.com/zsagi1368/zdsh-autopilot`。**分支集成冻结中**（等用户明确指令）。

## 当前位置

- 里程碑：**M0′ 脚手架 → M1 kernel**
- 最近更新：2026-08-24

## 里程碑状态

| 里程碑 | 状态 | 出口证据 |
|---|---|---|
| M0′ 独立脚手架 | ✅ 完成 2026-08-24 | 建仓+首推 https://github.com/zsagi1368/zdsh-autopilot ；lint/typecheck/test/build 全绿；双面产物 lib/+dist/client.cjs 验证 |
| M1 kernel | 🟡 进行中 | coordinator/ledger/audit/redact/probes/failures/defaults + facade 冻结 + 单测 |
| M2 continue | ⬜ | 状态机全覆盖 + eval/cases/continue ≥12 用例 |
| M3 guard | ⬜ | 词法/路径/工件/分类/越权 + eval/cases/guard ≥18 用例 |
| M4 review | ⬜ | 应答矩阵 ≥38 例 + 熔断/回喂 + eval/cases/review ≥14 用例 |
| M5 console | ⬜ | tab/面板/命令/通知/统计持久化 + i18n + 双语 README/DESIGN |
| M6′ 发布 | ⬜ | eval 全套 + 对抗 ×3 + fork link: 冒烟 + v0.1.0 tag + Release |
| 集成期 | 🔒 冻结 | 用户指令后按 plan/07 E4 执行 |

## 关键决策备忘（详见 plan/07）

- 独立包名 `zdsh-autopilot`，行 id `autopilot`；宿主包 devDeps 钉 `0.1.1-rc.2`，peer `>=0.1.0-rc.2 <0.2.0` optional。
- npm dist-tag `latest` 滞后（0.0.1-rc.1）是已知现象，勿据此改钉子。
- 共享文件白名单在独立期为 **0**；集成期才启用（web-app patch 一行 + 可选 tsconfig 行）。

## 抢救协议

代理沉默死亡后：先 `git log --oneline -5` + `git status` 盘点已落盘工作 → 重跑门禁验证 → 由主控补提交 → 重派任务时在任务书里写明"已完成部分勿重做"。

## 门禁速查

`pnpm verify`（= lint + typecheck + test + build；勿用 `pnpm ci`，那是 pnpm 内置冻结安装）；eval 引擎落地后并入。提交前必跑。
