import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat";

export type GrokMessage = ChatCompletionMessageParam;

export interface GrokTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export interface GrokToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface SearchParameters {
  mode?: "auto" | "on" | "off";
  // sources removed - let API use default sources to avoid format issues
}

export interface SearchOptions {
  search_parameters?: SearchParameters;
}

export interface GrokResponse {
  choices: Array<{
    message: {
      role: string;
      content: string | null;
      tool_calls?: GrokToolCall[];
    };
    finish_reason: string;
  }>;
}

export interface GrokClientOptions {
  timeout?: number;
  streamTimeout?: number;
  temperature?: number;
  maxTokens?: number;
}

export class GrokClient {
  private client: OpenAI;
  private currentModel: string = "grok-code-fast-1";
  private defaultMaxTokens: number;
  private defaultTemperature: number;
  private defaultTimeout: number;
  private defaultStreamTimeout: number;

  constructor(apiKey: string, model?: string, baseURL?: string, options?: GrokClientOptions) {
    // Use provided timeout or default to 360000ms (6 minutes)
    const timeout = options?.timeout || 360000;

    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || process.env.GROK_BASE_URL || "https://api.x.ai/v1",
      timeout,
    });

    // Store configuration
    this.defaultTimeout = timeout;
    this.defaultStreamTimeout = options?.streamTimeout || 3600000; // 1 hour for reasoning models
    this.defaultTemperature = options?.temperature || 0.7;

    const envMax = Number(process.env.GROK_MAX_TOKENS);
    this.defaultMaxTokens = options?.maxTokens || (Number.isFinite(envMax) && envMax > 0 ? envMax : 1536);

    if (model) {
      this.currentModel = model;
    }
  }

  setModel(model: string): void {
    this.currentModel = model;
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  async chat(
    messages: GrokMessage[],
    tools?: GrokTool[],
    model?: string,
    searchOptions?: SearchOptions,
    toolChoice?: "auto" | "required" | "none" | { type: "function"; function: { name: string } }
  ): Promise<GrokResponse> {
    try {
      const requestPayload: any = {
        model: model || this.currentModel,
        messages,
        tools: tools || [],
        tool_choice: toolChoice || (tools && tools.length > 0 ? "auto" : undefined),
        temperature: this.defaultTemperature,
        max_tokens: this.defaultMaxTokens,
        timeout: this.defaultTimeout,
      };

      // Add search parameters if specified
      if (searchOptions?.search_parameters) {
        requestPayload.search_parameters = searchOptions.search_parameters;
      }

      const response =
        await this.client.chat.completions.create(requestPayload);

      return response as GrokResponse;
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  async *chatStream(
    messages: GrokMessage[],
    tools?: GrokTool[],
    model?: string,
    searchOptions?: SearchOptions,
    toolChoice?: "auto" | "required" | "none" | { type: "function"; function: { name: string } }
  ): AsyncGenerator<any, void, unknown> {
    try {
      const requestPayload: any = {
        model: model || this.currentModel,
        messages,
        tools: tools || [],
        tool_choice: toolChoice || (tools && tools.length > 0 ? "auto" : undefined),
        temperature: this.defaultTemperature,
        max_tokens: this.defaultMaxTokens,
        stream: true,
        // Use extended timeout for streaming (especially for reasoning models)
        timeout: this.defaultStreamTimeout,
      };

      // Add search parameters if specified
      if (searchOptions?.search_parameters) {
        requestPayload.search_parameters = searchOptions.search_parameters;
      }

      const stream = (await this.client.chat.completions.create(
        requestPayload
      )) as any;

      for await (const chunk of stream) {
        yield chunk;
      }
    } catch (error: any) {
      throw new Error(`Grok API error: ${error.message}`);
    }
  }

  async search(
    query: string,
    searchParameters?: SearchParameters
  ): Promise<GrokResponse> {
    const searchMessage: GrokMessage = {
      role: "user",
      content: query,
    };

    const searchOptions: SearchOptions = {
      search_parameters: searchParameters || { mode: "on" },
    };

    return this.chat([searchMessage], [], undefined, searchOptions);
  }
}
