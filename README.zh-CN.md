# Exp-all-in-one

[日本語](README.md) · [中文](README.zh-CN.md) · [English](README.en.md)

面向课堂的统一实验平台，通过同一个入口开展 Double Auction、EMH 和 Judgement under Uncertainty。界面默认使用日语。

学生等待画面使用统一的卡片设计，并保留各实验的信息。

[教师入口](https://exp-all-in-one.vercel.app/teacher) · [学生入口](https://exp-all-in-one.vercel.app)（教师入口使用独立地址）

## 开始使用

```mermaid
---
config:
  theme: base
  look: classic
  layout: dagre
  htmlLabels: true
  flowchart:
    rankSpacing: 24
    wrappingWidth: 180
---
flowchart LR
    accTitle: 课堂使用流程
    accDescr: 教师创建房间，学生凭代码加入；教师开始实验，学生按提示参加，最后由教师下载结果。
    A["1 · 教师<br/>登录并选择实验<br/>建房并分享代码"]
    B["2 · 学生<br/>填写代码、昵称/学号、PIN<br/>加入并等待"]
    C["3 · 开展实验<br/>教师开始<br/>学生参加"]
    D["4 · 教师<br/>下载结果<br/>用于课堂讨论"]
    A --> B --> C --> D
    classDef teacher fill:#eeeefd,stroke:#5456c7,color:#22283d
    classDef shared fill:#f6f7fb,stroke:#6a7287,color:#22283d
    class A,D teacher
    class B,C shared
```

教师创建并分享房间，学生凭代码加入，按教师要求填写昵称或学号。实验由教师安排并讲解规则，结束后由教师下载结果。

Double Auction 的教师画面在实验开始后默认收起学生分配，可随时展开；演示模式也相同。演示设置采用黄色系，控制面板位于页眉下方。

教师密钥只在教师入口输入一次。同一浏览器在8小时内，刷新、切换实验、创建和管理房间都无需再次输入。退出登录、会话到期或密钥更换后需重新验证；每个房间的教师密码仍单独保留。

[图解操作、重新进入与房间管理](docs/guide/zh-CN/classroom.md) · [Demo Model 使用说明](docs/guide/zh-CN/demo.md)

教师登录后可通过 **Demo Model** 体验各实验；直接打开演示或屏幕尺寸预览也需要教师登录。

Judgement 教师页面和 Demo 共用任务卡片、已选列表和操作区，支持日中英切换，实验开始后锁定条件。

## 实验

| 实验                        | 内容                                                                   | 指南                                             | 演示                                                          |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| Double Auction              | 比较 CDA、Call Market、Posted Offer 三种制度，按实际人数分配市场与角色 | [流程与规则](docs/guide/zh-CN/double-auction.md) | [Demo Model](https://exp-all-in-one.vercel.app/demo)          |
| EMH                         | 交易证券，观察分红与信息如何影响价格形成（实验1、2）                   | [流程与规则](docs/guide/zh-CN/emh.md)            | [Demo Model](https://exp-all-in-one.vercel.app/emh/demo)      |
| Judgement under Uncertainty | 14项判断与认知偏差任务，支持条件分配、任务与选项顺序、计时及日中英显示 | [流程与数据](docs/guide/zh-CN/judgment.md)       | [Demo Model](https://exp-all-in-one.vercel.app/judgment/demo) |

## 独立 AI 学生程序

[EMH 实验 2 AI 学生程序](ai-emh/README.zh-CN.md) 可让指定数量的 AI 以学生身份参加，使用本地模型或 OpenAI API 决策。模型无响应时不会使用规则型 robot 代替。

## 开发与资料

技术栈为 Next.js / React / TypeScript，部署使用 Vercel + Neon PostgreSQL，运行环境为 Node.js 24.x。正式实验以独立模块共同维护在 `main` 分支。

PR 中的 **Documentation sync** 检查会提醒日中英 README 及相关指南中遗漏的更新。

- [本地启动、环境变量、部署与验证](docs/guide/zh-CN/development.md)
- [架构与开发约定（英文）](docs/architecture.md)
- [实验材料目录（日文及原始材料）](material/README.md)
- [EMH 原始材料与实施条件（日文）](docs/experiments/emh.md)
- [Judgment 原始出处、实施范围与限制](docs/upstream/judgment/README.zh-CN.md)
- [迁移与验证记录（英文）](docs/releases/unified-platform-migration.md)

[GitHub 与问题反馈](https://github.com/DKshawn/Exp-all-in-one/issues) · [Vercel 项目](https://vercel.com/dkshawns-projects/exp-all-in-one)
