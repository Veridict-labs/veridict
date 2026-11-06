import { Injectable } from '@nestjs/common';
import { HuggingFaceModel, type AgentModel } from '@veridict/agent';

@Injectable()
export class HuggingFaceProvider {
  create(): { model: AgentModel; modelId: string } {
    const modelId = process.env.HF_MODEL ?? '';
    return {
      model: new HuggingFaceModel({
        token: process.env.HF_TOKEN ?? '',
        model: modelId,
        billTo: process.env.HF_BILL_TO || undefined,
      }),
      modelId,
    };
  }
}
