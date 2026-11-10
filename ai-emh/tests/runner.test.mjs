import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { PassThrough, Writable } from "node:stream";
import {
  parseModelDecision,
  StudentClient,
  requestModel,
} from "../src/client.mjs";
import {
  actionFor,
  classifyAction,
  marketObservationKey,
  observation,
} from "../src/decision.mjs";
import {
  localModelAddress,
  platformAddress,
  resolveRoomCode,
  runStudent,
} from "../src/main.mjs";
import { createPrompts } from "../src/prompts.mjs";

function snapshot() {
  return {
    experiment: "exp2",
    role: "student",
    status: "running",
    marketId: 1,
    serverNow: 1000,
    market: {
      experiment: "exp2",
      status: "trading",
      pausedAt: null,
      year: 1,
      rounds: 6,
      unitKey: "1:A:1",
      unitEndsAt: 31000,
      periodEndsAt: 301000,
      exp2: {
        prior: [0.35, 0.42, 0.23],
        dividends: [80, 110, 170],
        clue: null,
        allDividends: [[999]],
        futureStates: [3],
      },
      me: { id: "me", holdings: 2, cash: 0, totalProfit: 0 },
      bid: { id: "bid-1", price: 100, participantId: null },
      ask: { id: "ask-1", price: 110, participantId: null },
      orderBook: {
        bid: [{ price: 100, quantity: 1, ownQuantity: 0, aliases: "private" }],
        ask: [],
      },
      ownQuotes: {
        bid: { status: "none", price: null },
        ask: { status: "none", price: null },
      },
      trades: [{ year: 1, price: 105, buyerId: "me", sellerId: null }],
      results: [],
    },
  };
}

async function server(handler) {
  const instance = http.createServer(handler);
  instance.listen(0, "127.0.0.1");
  await once(instance, "listening");
  return { instance, url: `http://127.0.0.1:${instance.address().port}` };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

function reply(response, body, headers = {}) {
  response.writeHead(200, { "Content-Type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

test("platform address accepts base URLs and extracts room codes from shared links", () => {
  assert.deepEqual(platformAddress("http://localhost:3000"), {
    baseUrl: "http://localhost:3000",
    roomCode: null,
  });
  assert.deepEqual(platformAddress("http://localhost:3000/?code=T56FYT"), {
    baseUrl: "http://localhost:3000",
    roomCode: "T56FYT",
  });
  assert.deepEqual(
    platformAddress("http://localhost:3000/room/t56fyt?entry=teacher"),
    { baseUrl: "http://localhost:3000", roomCode: "T56FYT" },
  );
  assert.equal(resolveRoomCode("t56fyt", "T56FYT"), "T56FYT");
  assert.throws(() => resolveRoomCode("ABCD23", "T56FYT"), /不一致/);
  assert.throws(
    () => platformAddress("http://localhost:3000/?code=INVALID"),
    /房间代码无效/,
  );
  assert.throws(
    () => platformAddress("http://localhost:3000/?token=secret"),
    /参加链接/,
  );
});

test("local model URL accepts the LM Studio server root, base URL or endpoint", () => {
  assert.equal(
    localModelAddress("http://127.0.0.1:1234"),
    "http://127.0.0.1:1234/v1",
  );
  assert.equal(
    localModelAddress("http://127.0.0.1:1234/v1/"),
    "http://127.0.0.1:1234/v1",
  );
  assert.equal(
    localModelAddress("http://127.0.0.1:1234/v1/chat/completions"),
    "http://127.0.0.1:1234/v1",
  );
  assert.equal(
    localModelAddress("http://127.0.0.1:1234/custom/v1"),
    "http://127.0.0.1:1234/custom/v1",
  );
  assert.throws(() => localModelAddress("http://127.0.0.1:1234/?token=secret"));
});

test("interactive model token prompt hides input and permits an empty token", async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};
  let visible = "";
  const output = new Writable({
    write(chunk, _encoding, done) {
      visible += chunk.toString();
      done();
    },
  });
  const prompts = createPrompts(input, output);
  const answer = prompts.secret("Token");
  input.write("sample-private-token\r");
  assert.equal(await answer, "sample-private-token");
  assert.match(visible, /Token/);
  assert.doesNotMatch(visible, /sample-private-token/);
  const empty = prompts.secret("Token optional");
  input.write("\r");
  assert.equal(await empty, "");
  const normal = prompts.ask("Model");
  input.write("example-model\r");
  assert.equal(await normal, "example-model");
  assert.match(visible, /example-model/);
  prompts.close();
});

test("accepts one complete JSON code fence without inventing a decision", () => {
  assert.deepEqual(
    parseModelDecision(
      '```json\n{"action":"bid","price":118,"reason":"example"}\n```',
    ),
    { action: "bid", price: 118, reason: "example" },
  );
  assert.deepEqual(
    parseModelDecision(
      '```\r\n{"action":"wait","price":null,"reason":"wait"}\r\n```',
    ),
    { action: "wait", price: null, reason: "wait" },
  );
  assert.throws(() =>
    parseModelDecision(
      'ignore this\n```json\n{"action":"bid","price":118,"reason":"example"}\n```',
    ),
  );
  assert.throws(() =>
    parseModelDecision('```json\n{"action":"bid"}\n``` trailing'),
  );
});

test("model receives only the student's own permitted information", () => {
  const state = snapshot();
  const seen = observation(state);
  assert.deepEqual(seen.dividends, [80, 110, 170]);
  assert.equal(seen.clue, null);
  assert.equal(seen.recentTrades[0].ownSide, "buy");
  const text = JSON.stringify(seen);
  assert.doesNotMatch(
    text,
    /allDividends|futureStates|private|participantId|sellerId/,
  );
  state.market.exp2.clue = 3;
  assert.equal(observation(state).clue, 3);
});

test("waiting observes meaningful market changes, not clock ticks or empty unit rollover", () => {
  const initial = snapshot();
  const later = snapshot();
  later.serverNow += 1000;
  later.market.unitKey = "1:A:2";
  assert.equal(marketObservationKey(later), marketObservationKey(initial));
  later.market.bid.price++;
  assert.notEqual(marketObservationKey(later), marketObservationKey(initial));
  later.market.bid.price--;
  later.market.trades.push({ ...later.market.trades[0] });
  assert.notEqual(marketObservationKey(later), marketObservationKey(initial));
  later.market.trades.pop();
  later.market.exp2.clue = 2;
  assert.notEqual(marketObservationKey(later), marketObservationKey(initial));
});

test("a waiting student makes no repeat model request until the market changes", async (t) => {
  const current = snapshot();
  let modelCalls = 0;
  const model = await server(async (_request, response) => {
    modelCalls++;
    reply(response, {
      choices: [
        {
          message: {
            content: JSON.stringify(
              modelCalls === 1
                ? { action: "wait", price: null, reason: "observe" }
                : { action: "bid", price: 105, reason: "market changed" },
            ),
          },
        },
      ],
    });
  });
  t.after(() => model.instance.close());
  const controller = new AbortController();
  const events = [];
  let callsBeforeChange;
  let actions = 0;
  const deadline = setTimeout(() => controller.abort(), 2000);
  t.after(() => clearTimeout(deadline));
  await runStudent(
    {
      identity: { nickname: "AABC001" },
      state: async () => structuredClone(current),
      act: async () => {
        actions++;
      },
    },
    {
      provider: "local",
      modelUrl: `${model.url}/v1`,
      model: "test",
      interval: 0.01,
      timeout: 1,
      pollSeconds: 0.01,
    },
    { acquire: () => true, release() {} },
    controller.signal,
    (event) => {
      events.push(event);
      if (event.type === "waiting_started") {
        current.serverNow += 1000;
        current.market.unitKey = "1:A:2";
        setTimeout(() => {
          callsBeforeChange = modelCalls;
          current.market.bid.price++;
        }, 80);
      }
      if (event.type === "submitted") controller.abort();
    },
  );
  assert.equal(callsBeforeChange, 1);
  assert.equal(modelCalls, 2);
  assert.equal(actions, 1);
  assert.equal(
    events.find((event) => event.type === "waiting_ended")?.reason,
    "market_changed",
  );
  assert.ok(
    events.find((event) => event.type === "waiting_ended")?.waitDurationMs >=
      60,
  );
});

test("market changes during a wait decision trigger a fresh decision", async (t) => {
  const current = snapshot();
  let calls = 0;
  const model = await server((_request, response) => {
    calls++;
    if (calls === 1) current.market.ask.price++;
    reply(response, {
      choices: [
        {
          message: {
            content: JSON.stringify(
              calls === 1
                ? { action: "wait", price: null, reason: "observe" }
                : { action: "bid", price: 105, reason: "updated" },
            ),
          },
        },
      ],
    });
  });
  t.after(() => model.instance.close());
  const controller = new AbortController();
  const events = [];
  const deadline = setTimeout(() => controller.abort(), 2000);
  t.after(() => clearTimeout(deadline));
  await runStudent(
    {
      identity: { nickname: "AABC001" },
      state: async () => structuredClone(current),
      act: async () => {},
    },
    {
      provider: "local",
      modelUrl: `${model.url}/v1`,
      model: "test",
      interval: 0.01,
      timeout: 1,
      pollSeconds: 0.01,
    },
    { acquire: () => true, release() {} },
    controller.signal,
    (event) => {
      events.push(event);
      if (event.type === "submitted") controller.abort();
    },
  );
  assert.equal(calls, 2);
  assert.equal(
    events.find((event) => event.type === "waiting_ended")?.reason,
    "market_changed",
  );
  assert.equal(
    events.some((event) => event.type === "submitted"),
    true,
  );
});

test("paused waiting students do not call the model until trading resumes", async (t) => {
  const current = snapshot();
  let calls = 0;
  let callsWhilePaused;
  const model = await server((_request, response) => {
    calls++;
    reply(response, {
      choices: [
        {
          message: {
            content: JSON.stringify(
              calls === 1
                ? { action: "wait", price: null, reason: "observe" }
                : { action: "bid", price: 105, reason: "resume" },
            ),
          },
        },
      ],
    });
  });
  t.after(() => model.instance.close());
  const controller = new AbortController();
  const events = [];
  const deadline = setTimeout(() => controller.abort(), 2000);
  t.after(() => clearTimeout(deadline));
  await runStudent(
    {
      identity: { nickname: "AABC001" },
      state: async () => structuredClone(current),
      act: async () => {},
    },
    {
      provider: "local",
      modelUrl: `${model.url}/v1`,
      model: "test",
      interval: 0.01,
      timeout: 1,
      pollSeconds: 0.01,
    },
    { acquire: () => true, release() {} },
    controller.signal,
    (event) => {
      events.push(event);
      if (event.type === "waiting_started") current.market.pausedAt = 1001;
      if (event.type === "waiting_ended")
        setTimeout(() => {
          callsWhilePaused = calls;
          current.market.pausedAt = null;
        }, 60);
      if (event.type === "submitted") controller.abort();
    },
  );
  assert.equal(callsWhilePaused, 1);
  assert.equal(calls, 2);
  assert.equal(
    events.find((event) => event.type === "waiting_ended")?.reason,
    "market_inactive",
  );
});

test("model actions are validated and stale or paused decisions never trade", () => {
  const original = snapshot();
  assert.deepEqual(
    actionFor(
      { action: "buy", price: null, reason: "buy" },
      original,
      snapshot(),
    ),
    { kind: "accept", side: "ask", quoteId: "ask-1", unitKey: "1:A:1" },
  );
  assert.deepEqual(
    actionFor(
      { action: "bid", price: 109, reason: "bid" },
      original,
      snapshot(),
    ),
    { kind: "quote", side: "bid", price: 109, unitKey: "1:A:1" },
  );
  const changed = snapshot();
  changed.market.ask.id = "other";
  assert.equal(
    actionFor({ action: "buy", price: null, reason: "buy" }, original, changed),
    null,
  );
  changed.market.unitKey = "1:A:2";
  assert.equal(
    actionFor({ action: "bid", price: 109, reason: "bid" }, original, changed),
    null,
  );
  changed.market.unitKey = original.market.unitKey;
  changed.market.pausedAt = 1001;
  assert.equal(
    actionFor({ action: "bid", price: 109, reason: "bid" }, original, changed),
    null,
  );
  assert.equal(
    actionFor(
      { action: "bid", price: -1, reason: "bad" },
      original,
      snapshot(),
    ),
    null,
  );
  assert.equal(
    actionFor(
      { action: "wait", price: null, reason: "wait" },
      original,
      snapshot(),
    ),
    null,
  );
});

test("skip reasons distinguish waiting, changed quotes and expired units", () => {
  const original = snapshot();
  const current = snapshot();
  assert.equal(
    classifyAction(
      { action: "wait", price: null, reason: "wait" },
      original,
      current,
    ).skipReason,
    "model_wait",
  );
  current.market.ask.id = "changed";
  assert.equal(
    classifyAction(
      { action: "buy", price: null, reason: "buy" },
      original,
      current,
    ).skipReason,
    "quote_changed",
  );
  current.market.unitKey = "1:A:2";
  assert.equal(
    classifyAction(
      { action: "buy", price: null, reason: "buy" },
      original,
      current,
    ).skipReason,
    "unit_changed",
  );
  current.market.pausedAt = 1001;
  assert.equal(
    classifyAction(
      { action: "buy", price: null, reason: "buy" },
      original,
      current,
    ).skipReason,
    "market_inactive",
  );
});

test("separate student cookies are used for joining, state and transactions", async (t) => {
  const seen = [];
  const mock = await server(async (request, response) => {
    if (request.url.endsWith("/join")) {
      const body = await readBody(request);
      return reply(
        response,
        { code: "ABCD23" },
        {
          "Set-Cookie": `auction_ABCD23_student=${body.nickname}; Path=/api/rooms/ABCD23; HttpOnly`,
        },
      );
    }
    seen.push({
      cookie: request.headers.cookie,
      body: request.method === "POST" ? await readBody(request) : null,
    });
    reply(response, { state: snapshot() });
  });
  t.after(() => mock.instance.close());
  const first = new StudentClient(mock.url, "ABCD23", {
    nickname: "AABC001",
    pin: "1234",
  });
  const second = new StudentClient(mock.url, "ABCD23", {
    nickname: "AABC002",
    pin: "5678",
  });
  await Promise.all([first.join(), second.join()]);
  await first.state();
  await second.state();
  await first.act(1, {
    kind: "quote",
    side: "bid",
    price: 100,
    unitKey: "1:A:1",
  });
  assert.match(seen[0].cookie, /AABC001/);
  assert.match(seen[1].cookie, /AABC002/);
  assert.match(seen[2].cookie, /AABC001/);
  assert.equal(seen[2].body.scope, "market");
  assert.match(seen[2].body.requestId, /^[\da-f-]{36}$/);
});

test("compatible local model response makes one real student request", async (t) => {
  let posted;
  let modelInput;
  const platform = await server(async (request, response) => {
    if (request.url.endsWith("/join"))
      return reply(
        response,
        { code: "ABCD23" },
        { "Set-Cookie": "auction_ABCD23_student=abc; Path=/api/rooms/ABCD23" },
      );
    if (request.method === "POST") {
      posted = await readBody(request);
      reply(response, { state: snapshot() });
      return;
    }
    reply(response, { state: snapshot() });
  });
  const model = await server(async (request, response) => {
    modelInput = await readBody(request);
    if (modelInput.response_format?.type !== "json_schema") {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          error: "'response_format.type' must be 'json_schema' or 'text'",
        }),
      );
      return;
    }
    reply(response, {
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: "bid",
              price: 105,
              reason: "below value",
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100 },
    });
  });
  t.after(() => {
    platform.instance.close();
    model.instance.close();
  });
  const client = new StudentClient(platform.url, "ABCD23", {
    nickname: "AABC001",
    pin: "1234",
  });
  await client.join();
  const controller = new AbortController();
  const reports = [];
  await runStudent(
    client,
    {
      provider: "local",
      modelUrl: `${model.url}/v1`,
      model: "test",
      interval: 10,
      timeout: 2,
      pollSeconds: 0.01,
    },
    { acquire: () => true, release() {} },
    controller.signal,
    (event) => {
      reports.push(event);
      controller.abort();
    },
  );
  assert.equal(modelInput.model, "test");
  assert.equal(modelInput.response_format.type, "json_schema");
  assert.equal(
    modelInput.response_format.json_schema.name,
    "emh_student_decision",
  );
  assert.equal(JSON.parse(modelInput.messages[1].content).clue, null);
  assert.deepEqual(posted.action, {
    kind: "quote",
    side: "bid",
    price: 105,
    unitKey: "1:A:1",
  });
  assert.equal(reports[0].type, "submitted");
  assert.ok(
    Number.isInteger(reports[0].modelDurationMs) &&
      reports[0].modelDurationMs >= 0,
  );
});

test("model timeout or malformed response causes no fallback transaction", async (t) => {
  const invalid = await server((request, response) =>
    reply(response, { choices: [{ message: { content: "not json" } }] }),
  );
  t.after(() => invalid.instance.close());
  let transactions = 0;
  const controller = new AbortController();
  const client = {
    identity: { nickname: "AABC001" },
    state: async () => snapshot(),
    act: async () => {
      transactions++;
    },
  };
  const events = [];
  await runStudent(
    client,
    {
      provider: "local",
      modelUrl: `${invalid.url}/v1`,
      model: "test",
      interval: 1,
      timeout: 1,
      pollSeconds: 0.01,
    },
    { acquire: () => true, release() {} },
    controller.signal,
    (event) => {
      events.push(event);
      controller.abort();
    },
  );
  assert.equal(events[0].type, "error");
  assert.equal(events[0].errorStage, "model");
  assert.equal(events[0].skipReason, "model_error");
  assert.ok(
    Number.isInteger(events[0].modelDurationMs) &&
      events[0].modelDurationMs >= 0,
  );
  assert.equal(transactions, 0);
  const slow = await server(() => {});
  t.after(() => slow.instance.closeAllConnections());
  t.after(() => slow.instance.close());
  await assert.rejects(
    requestModel({
      baseUrl: `${slow.url}/v1`,
      model: "test",
      timeoutMs: 50,
      prompt: { system: "json", observation: {} },
      schema: { type: "json_object" },
    }),
    { name: "TimeoutError" },
  );
  assert.equal(transactions, 0);
});

test("model timeout records duration and does not trade", async (t) => {
  const slow = await server(() => {});
  t.after(() => slow.instance.closeAllConnections());
  t.after(() => slow.instance.close());
  const controller = new AbortController();
  const events = [];
  let transactions = 0;
  await runStudent(
    {
      identity: { nickname: "AABC001" },
      state: async () => snapshot(),
      act: async () => transactions++,
    },
    {
      provider: "local",
      modelUrl: `${slow.url}/v1`,
      model: "test",
      interval: 1,
      timeout: 0.05,
      pollSeconds: 0.01,
    },
    { acquire: () => true, release() {} },
    controller.signal,
    (event) => {
      events.push(event);
      controller.abort();
    },
  );
  assert.equal(events[0].skipReason, "model_timeout");
  assert.ok(events[0].modelDurationMs >= 40);
  assert.equal(transactions, 0);
});

test("full model concurrency records a deferral without a model request", async () => {
  const controller = new AbortController();
  const events = [];
  await runStudent(
    { identity: { nickname: "AABC001" }, state: async () => snapshot() },
    { interval: 1, pollSeconds: 0.01 },
    { acquire: () => false },
    controller.signal,
    (event) => {
      events.push(event);
      controller.abort();
    },
  );
  assert.equal(events[0].type, "deferred");
  assert.equal(events[0].skipReason, "model_capacity");
  assert.equal(events[0].modelDurationMs, undefined);
});

test("OpenAI requests use structured output and bearer authentication", async (t) => {
  let received;
  let auth;
  const mock = await server(async (request, response) => {
    auth = request.headers.authorization;
    received = await readBody(request);
    reply(response, {
      choices: [
        {
          message: {
            content: '{"action":"wait","price":null,"reason":"wait"}',
          },
        },
      ],
    });
  });
  t.after(() => mock.instance.close());
  const result = await requestModel({
    baseUrl: `${mock.url}/v1`,
    apiKey: "test-key",
    model: "test-model",
    timeoutMs: 2000,
    provider: "openai",
    prompt: { system: "json", observation: {} },
    schema: { type: "json_schema", json_schema: { name: "test" } },
  });
  assert.equal(auth, "Bearer test-key");
  assert.equal(received.response_format.type, "json_schema");
  assert.equal(received.max_completion_tokens, 2048);
  assert.equal(result.decision.action, "wait");
  await requestModel({
    baseUrl: `${mock.url}/v1`,
    model: "test-model",
    timeoutMs: 2000,
    provider: "openai",
    maxOutputTokens: 1024,
    prompt: { system: "json", observation: {} },
    schema: { type: "json_schema", json_schema: { name: "test" } },
  });
  assert.equal(received.max_completion_tokens, 1024);
});

test("LM Studio fast mode requests an AI decision without long reasoning", async (t) => {
  let received;
  let requestPath;
  const mock = await server(async (request, response) => {
    requestPath = request.url;
    received = await readBody(request);
    reply(response, {
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: '{"action":"bid","price":100,"reason":"buy"}',
            },
          ],
        },
      ],
    });
  });
  t.after(() => mock.instance.close());
  const result = await requestModel({
    baseUrl: `${mock.url}/v1`,
    model: "test-model",
    timeoutMs: 2000,
    lmstudioFast: true,
    prompt: { system: "json", observation: {} },
    schema: {
      type: "json_schema",
      json_schema: { name: "test", schema: { type: "object" } },
    },
  });
  assert.equal(requestPath, "/v1/responses");
  assert.equal(received.max_output_tokens, 2048);
  assert.deepEqual(received.reasoning, { effort: "none" });
  assert.equal(received.text.format.type, "json_schema");
  assert.equal(received.store, false);
  assert.equal(result.decision.action, "bid");
});

test("empty or truncated model responses explain the failure without submitting a decision", async (t) => {
  const responses = [
    { choices: [{ finish_reason: "length", message: { content: null } }] },
    {
      choices: [
        {
          finish_reason: "stop",
          message: { content: null, reasoning: "private" },
        },
      ],
    },
    { result: "unsupported endpoint" },
  ];
  const mock = await server((_request, response) =>
    reply(response, responses.shift()),
  );
  t.after(() => mock.instance.close());
  const call = () =>
    requestModel({
      baseUrl: `${mock.url}/v1`,
      model: "test",
      timeoutMs: 2000,
      maxOutputTokens: 1024,
      prompt: { system: "json", observation: {} },
      schema: { type: "json_object" },
    });
  await assert.rejects(call(), /1024 tokens/);
  await assert.rejects(call(), /推理内容/);
  await assert.rejects(call(), /Chat Completions/);
});
