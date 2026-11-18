# Agent-Based Behavioral Experiments

[日本語](README.md) · [English](README.en.md)

这个独立的 Node.js 程序通过学生接口让 AI 参加 Double Auction、EMH 和随机演化博弈（SEG）的正式房间，并根据房间代码识别实验。教师负责创建房间、确认分配和开始。建议使用独立的测试环境和数据库。

## 使用方法

需要 Node.js 22 或更高版本，无需安装 npm 依赖。创建支持的正式房间后，从仓库根目录运行。

```powershell
node ai-emh/run.mjs
```

按提示输入平台地址、房间代码、AI 人数、模型来源和模型名称。也可以直接在地址处粘贴带房间代码的学生参加链接或教师房间链接，程序会自动识别房间代码。本地模型需要先启动支持 OpenAI 兼容 Chat Completions 和 JSON Schema 结构化输出的服务，例如 Ollama 的 `http://127.0.0.1:11434/v1` 或 LM Studio 的 `http://localhost:1234/v1`，并提前准备好模型。

程序会提示隐藏输入本地模型 Token：服务不要求验证时直接按回车，LM Studio 等服务要求验证时输入相应 Token。OpenAI 模式会提示隐藏输入 API 密钥。也可以预先通过环境变量 `LOCAL_MODEL_API_KEY` 或 `OPENAI_API_KEY` 提供密钥；程序不会把密钥写入恢复文件或记录。

入室完成后，在教师页面确认市场分配并开始实验。程序持续显示提交的 AI 操作和错误；Ctrl+C 停止程序。房间中的学生身份不会因此被删除。

也可以使用参数运行，例如：

```powershell
node ai-emh/run.mjs --url http://localhost:3000 --room ABCD23 --count 90 --provider local --local-url http://127.0.0.1:11434/v1 --model qwen3
node ai-emh/run.mjs --url http://localhost:3000 --room ABCD23 --count 90 --provider openai --model gpt-5.4-mini
node ai-emh/run.mjs --help
```

把模型名换成已安装或账号可用的模型。本地服务地址如果只输入主机和端口，程序会自动补上 `/v1`。`--interval` 设置每名学生最短决策间隔（秒，默认 10），`--timeout` 设置模型请求超时（秒，默认 20），`--parallel` 设置最多同时进行的模型请求数（默认 8）。达到并发上限时学生等待下一次机会，实际决策间隔可能更长。OpenAI 和本地模式均使用 JSON Schema 结构化输出。`--max-output-tokens` 设置模型输出上限（默认 2048），包括适用时的推理 tokens。

如果 LM Studio 的模型在长时间思考后仍无法给出决定，可在启动时增加 `--lmstudio-fast`。此模式使用 LM Studio 的 Responses 接口并关闭模型的长思考，仍由模型自主决定；模型和服务必须支持此设置，决策行为也可能与思考模式不同。可以同时调整 `--parallel` 和 `--max-output-tokens`，例如 `--lmstudio-fast --parallel 4 --max-output-tokens 1024`。没有这个参数时保持模型服务默认的思考设置。

## 恢复与记录

每次新运行会在 `ai-emh/.local/runs/` 创建包含房间地址、学生昵称和 PIN 的恢复文件，以及不含 API 密钥的 `.jsonl` 操作记录。记录包含模型决定及模型返回的 token 使用量，可能包含 AI 的私有条件；请妥善保存。文件不会提交到 Git。日志中的 `modelDurationMs` 是每次模型请求从发起到解析响应所用的毫秒数。`skipReason` 区分 `unit_changed`（交易单位已切换）、`quote_changed`（对手报价变化）、`model_capacity`（并发已满，暂缓请求）等原因；错误还会记录 `errorStage`。暂缓不代表已经发出模型请求。恢复文件可用于程序中断后重新登录同一批学生：

```powershell
node ai-emh/run.mjs --resume ai-emh/.local/runs/房间代码-时间-标识.json --provider local --local-url http://127.0.0.1:11434/v1 --model qwen3
```

恢复时平台地址、房间代码、实验和人数来自恢复文件。旧版 EMH 的恢复文件也能使用。新学生须在关闭入室前加入，开始后可用已登记身份重连。

## 决策规则

AI 选择等待后，程序约每 2 秒读取学生视图。交易实验在订单、成交或持仓等信息变化时重新决策，SEG 在下一轮可作答时重新决策。单纯的倒计时变化不会触发模型请求，最短决策间隔和并发上限仍然适用。

- **Double Auction** 支持 CDA、Call Market、Posted Offer 和旧三商品 CDA。模型根据自身的价值或成本和公开信息选择可用操作。AI 每次操作提交一个单位。Call Market 的未公开订单不会发送给模型。
- **EMH** 支持实验 1（固定分红）和实验 2（抽签分红）。模型根据自身分红、持仓、交易记录和公开价格交易。实验 2 只有本人获得的 Clue 才会提供给模型。
- **SEG** 支持协调博弈和 Nash 需求博弈。模型根据自己的位置、收益规则和个人历史，每轮作答一次。在提交决定前，模型看不到当前对手的选择。

程序验证模型返回的 JSON，并在提交前刷新学生视图以确认操作仍然有效。模型超时、决定无效或过期时跳过操作，不使用规则机器人代替。选择 OpenAI 时会向 OpenAI 发送这些实验观察，费用取决于模型和用量。

运行 `npm --prefix ai-emh test` 可执行本程序的离线模拟测试。当前平台的学生接口不是专门承诺稳定的公共 API；平台更新后需要重新验证兼容性。
