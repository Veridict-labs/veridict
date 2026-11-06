import { Injectable } from '@nestjs/common';
import {
  AgentError,
  GeminiModel,
  HuggingFaceModel,
  type AgentModel,
} from '@veridict/agent';

@Injectable()
export class ModelProvider {
  create(): {
    provider: 'gemini' | 'huggingface';
    model: AgentModel;
    modelId: string;
  } {
    const provider = process.env.AI_PROVIDER ?? 'gemini';
    if (provider === 'gemini') {
      const modelId = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite';
      return {
        provider,
        modelId,
        model: new GeminiModel({
          apiKey: process.env.GEMINI_API_KEY ?? '',
          model: modelId,
        }),
      };
    }
    if (provider === 'huggingface') {
      const modelId = process.env.HF_MODEL ?? '';
      return {
        provider,
        modelId,
        model: new HuggingFaceModel({
          token: process.env.HF_TOKEN ?? '',
          model: modelId,
          billTo: process.env.HF_BILL_TO || undefined,
        }),
      };
    }
    throw new AgentError('AI_NOT_CONFIGURED');
  }
}
