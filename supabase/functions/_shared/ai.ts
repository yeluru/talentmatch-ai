type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "tool"; content: string; tool_call_id: string };

type ToolDef = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

type ToolChoice =
  | "auto"
  | "none"
  | { type: "function"; function: { name: string } };

export type ChatCompletionsRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  tool_choice?: ToolChoice;
};

export type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
  }>;
};

function getProviderConfig() {
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");

  if (openAiKey) {
    return {
      provider: "openai" as const,
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: openAiKey,
      defaultModel: Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
    };
  }

  if (lovableKey) {
    return {
      provider: "lovable" as const,
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableKey,
      defaultModel: Deno.env.get("LOVABLE_MODEL") || "google/gemini-2.5-flash",
    };
  }

  return null;
}

export async function callChatCompletions(
  req: Omit<ChatCompletionsRequest, "model"> & { model?: string },
) {
  const cfg = getProviderConfig();
  if (!cfg) {
    throw new Error(
      "No AI provider configured. Set OPENAI_API_KEY (recommended) or LOVABLE_API_KEY.",
    );
  }

  const model = req.model || cfg.defaultModel;

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...req, model }),
  });

  return { res, provider: cfg.provider };
}



