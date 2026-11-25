import { randomUUID } from "node:crypto";

export class RequestError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(
  url,
  { body, cookie, timeoutMs = 10000, headers = {}, signal } = {},
) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    redirect: "error",
  });
  let data;
  try {
    data = await response.json();
  } catch {
    signal?.throwIfAborted();
    throw new RequestError(
      `服务器返回了无法解析的内容（HTTP ${response.status}）`,
      response.status,
    );
  }
  if (!response.ok)
    throw new RequestError(
      data.error?.message || data.error || `HTTP ${response.status}`,
      response.status,
    );
  return { response, data };
}

export class StudentClient {
  constructor(baseUrl, code, identity, experiment = "emh") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.code = code;
    this.identity = identity;
    this.experiment = experiment;
    this.cookie = null;
    this.path = `${this.baseUrl}/api/rooms/${code}`;
  }

  async join() {
    const { response } = await request(`${this.path}/join`, {
      body: { nickname: this.identity.nickname, pin: this.identity.pin },
    });
    const cookies = response.headers.getSetCookie();
    const cookieName = `auction_${this.code}_student`;
    const found = cookies.find((value) => value.startsWith(`${cookieName}=`));
    if (!found) throw new Error("入室成功但没有收到学生会话 cookie");
    this.cookie = found.split(";", 1)[0];
  }

  async state(signal = undefined) {
    const endpoint =
      this.experiment === "institutions" ? "" : `/${this.experiment}`;
    const { data } = await request(`${this.path}${endpoint}?session=student`, {
      cookie: this.cookie,
      signal,
    });
    return this.experiment === "emh" ? data.state : data;
  }

  async act(target, action) {
    if (this.experiment === "institutions") {
      const { data } = await request(`${this.path}/commands?session=student`, {
        cookie: this.cookie,
        body: { requestId: randomUUID(), ...target, command: action },
      });
      return data;
    }
    if (this.experiment === "evolution") {
      const { data } = await request(`${this.path}/evolution?session=student`, {
        cookie: this.cookie,
        body: action,
      });
      return data;
    }
    const { data } = await request(`${this.path}/emh?session=student`, {
      cookie: this.cookie,
      body: {
        requestId: randomUUID(),
        scope: "market",
        marketId: target,
        action,
      },
    });
    return data.state;
  }
}

export async function checkRoom(baseUrl, code) {
  const { data } = await request(
    `${baseUrl.replace(/\/$/, "")}/api/rooms/${code}/entry`,
  );
  if (!["emh", "institutions", "evolution"].includes(data.experiment))
    throw new Error("AI 学生支持 Double Auction、EMH 和 SEG 房间");
  return data.experiment;
}

export function parseModelDecision(content) {
  const text = content.trim();
  const fenced = text.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  return JSON.parse(fenced ? fenced[1] : text);
}

export const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

function responseDetails(data) {
  return {
    usage: data.usage ?? null,
    responseModel: typeof data.model === "string" ? data.model : null,
  };
}

class ModelResponseError extends Error {
  constructor(message, details) {
    super(message);
    Object.assign(this, details);
  }
}

export async function requestModel({
  baseUrl,
  apiKey,
  model,
  timeoutMs,
  prompt,
  schema,
  provider = "local",
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
  lmstudioFast = false,
  signal = undefined,
}) {
  if (lmstudioFast) {
    const { data } = await request(`${baseUrl.replace(/\/$/, "")}/responses`, {
      timeoutMs,
      signal,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      body: {
        model,
        input: [
          { role: "system", content: prompt.system },
          { role: "user", content: JSON.stringify(prompt.observation) },
        ],
        reasoning: { effort: "none" },
        text: { format: { type: "json_schema", ...schema.json_schema } },
        max_output_tokens: maxOutputTokens,
        store: false,
      },
    });
    const details = responseDetails(data);
    const content = data.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text;
    if (!content)
      throw new ModelResponseError(
        "LM Studio 没有返回最终交易决定；请检查模型服务和输出上限",
        details,
      );
    try {
      return {
        decision: parseModelDecision(content),
        ...details,
      };
    } catch {
      throw new ModelResponseError(
        "LM Studio 返回的决定不是有效 JSON",
        details,
      );
    }
  }
  const { data } = await request(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      timeoutMs,
      signal,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      body: {
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: JSON.stringify(prompt.observation) },
        ],
        response_format: schema,
        ...(provider === "openai"
          ? { max_completion_tokens: maxOutputTokens }
          : { max_tokens: maxOutputTokens }),
      },
    },
  );
  const details = responseDetails(data);
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  const reachedOutputLimit = choice?.finish_reason === "length";
  if (typeof content === "string" && content.trim()) {
    try {
      return {
        decision: parseModelDecision(content),
        ...details,
      };
    } catch {
      if (!reachedOutputLimit)
        throw new ModelResponseError("模型返回的决定不是有效 JSON", details);
    }
  }
  if (reachedOutputLimit)
    throw new ModelResponseError(
      `模型达到 ${maxOutputTokens} tokens 的输出上限，未返回完整决定；可增大 --max-output-tokens`,
      details,
    );
  if (choice?.message?.reasoning || choice?.message?.reasoning_content)
    throw new ModelResponseError(
      "模型返回了推理内容，但没有返回最终交易决定；可检查思考模式与输出上限",
      details,
    );
  if (!choice)
    throw new ModelResponseError(
      "模型接口未返回 Chat Completions 格式；请检查本地模型地址和模型服务",
      details,
    );
  throw new ModelResponseError(
    "模型返回空内容，没有交易决定；请检查模型服务日志",
    details,
  );
}
