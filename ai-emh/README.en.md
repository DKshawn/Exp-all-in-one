# Agent-Based Behavioral Experiments

[日本語](README.md) · [中文](README.zh-CN.md)

This standalone Node.js participant joins formal rooms for Double Auction, EMH, and Stochastic Evolutionary Games (SEG) through the student API. It detects the experiment from the room code. The teacher creates the room, confirms enrollment or allocation, and starts the experiment. Use a separate test environment and database.

## Usage

Node.js 22 or newer is required. The program uses Node.js built-ins. Create a supported formal room and run the following command from the repository root.

```powershell
node ai-emh/run.mjs
```

Enter the platform URL, room code, AI count, model provider and model name when prompted. You can also paste a student participation link or teacher room link as the address; the program extracts its room code. For a local model, first run an OpenAI-compatible Chat Completions server supporting JSON Schema structured output and prepare a model, for example Ollama at `http://127.0.0.1:11434/v1` or LM Studio at `http://localhost:1234/v1`.

The program prompts for the local model token without displaying it: press Enter if the service does not require authentication, or provide its token when required, as with some LM Studio installations. OpenAI mode prompts for its API key without displaying it. Alternatively, set `LOCAL_MODEL_API_KEY` or `OPENAI_API_KEY` in the environment first. Keys are never saved in recovery files or logs.

Once everyone has joined, confirm allocation and start from the teacher page. The program displays submitted AI actions and errors. Ctrl+C stops it without deleting enrolled students.

Alternatively, pass parameters:

```powershell
node ai-emh/run.mjs --url http://localhost:3000 --room ABCD23 --count 90 --provider local --local-url http://127.0.0.1:11434/v1 --model qwen3
node ai-emh/run.mjs --url http://localhost:3000 --room ABCD23 --count 90 --provider openai --model gpt-5.4-mini
node ai-emh/run.mjs --help
```

Replace the model name with an installed or available model. When a local service address contains only a host and port, the program automatically appends `/v1`. `--interval` is the minimum decision interval per student in seconds (default 10); `--timeout` is the model timeout in seconds (default 20); `--parallel` limits concurrent model requests (default 8). Students wait for another opportunity when the concurrency limit is reached, so actual intervals may be longer. Both OpenAI and local modes use JSON Schema structured output. `--max-output-tokens` sets the output limit (default 2048), including reasoning tokens when applicable.

If an LM Studio model spends too long reasoning without producing a decision, add `--lmstudio-fast`. This uses LM Studio's Responses interface with extended reasoning disabled; the model still makes the decision. The service and model must support this setting, and its decisions may differ from reasoning mode. You can also adjust concurrency and output limits, for example `--lmstudio-fast --parallel 4 --max-output-tokens 1024`. Without the flag the model service's default reasoning settings apply.

## Recovery and logs

Each new run saves a recovery file containing the platform address, student names and PINs, plus a `.jsonl` action log without the API key, under `ai-emh/.local/runs/`. The log records AI decisions and reported token usage and may contain the AI's private conditions; store it carefully. These files are excluded from Git. In the log, `modelDurationMs` measures each model request through response parsing in milliseconds. `skipReason` identifies causes such as `unit_changed`, `quote_changed`, or `model_capacity` (deferred until a concurrency slot is free); errors also include `errorStage`. A deferral is not a model request. Resume the same students after interruption with:

```powershell
node ai-emh/run.mjs --resume ai-emh/.local/runs/room-time-id.json --provider local --local-url http://127.0.0.1:11434/v1 --model qwen3
```

Recovery files identify the platform, room, experiment, and AI roster. Existing EMH recovery files still work. New students must join before admission closes. Registered students can reconnect after the experiment starts.

## Decisions

After a model chooses to wait, the program checks the student view about every two seconds. A market change such as a new quote, trade, or change in holdings triggers another decision. In SEG, the next eligible round triggers a decision. Clock ticks alone do not trigger a request. The minimum decision interval and concurrency limit still apply.

- **Double Auction** supports CDA, Call Market, Posted Offer, and legacy three-good CDA. The model uses its own values or costs and public information to pick an available action. Each AI order or purchase is for one unit. Sealed Call orders from other students are excluded from model prompts.
- **EMH** supports Experiment 1 (fixed dividends) and Experiment 2 (dividends determined by a draw). The model trades using its own dividends, holdings, trade history, and public prices. Only a Clue the student actually received is included in Experiment 2.
- **SEG** supports the coordination and Nash demand games. Each model makes one choice per round using its own position, payoff rules, and personal history. The current opponent's choice stays private before the student's submission.

The program validates the model's JSON and refreshes the student view before submitting a decision. It skips a timed-out, invalid, or stale decision without substituting a rule-based robot. OpenAI mode sends these observations to OpenAI and incurs charges according to model and usage.

Run `npm --prefix ai-emh test` for offline simulated tests. The current student interface is not a dedicated stable public API, so verify compatibility after platform updates.
