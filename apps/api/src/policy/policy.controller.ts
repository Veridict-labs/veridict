import { Body, Controller, Post } from '@nestjs/common';
import {
  caseInput,
  policyInput,
  precedentInput,
  reconcileInput,
  resolveInput,
} from '@veridict/contracts';
import { CurrentActor, type Actor } from '../auth/actor';
import { parse } from '../common/validation';
import { PolicyService } from './policy.service';

@Controller('v1')
export class PolicyController {
  constructor(private readonly policy: PolicyService) {}
  @Post('policies')
  create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.policy.create(actor, parse(policyInput, body));
  }
  @Post('policies/resolve')
  resolve(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.policy.resolve(actor, parse(resolveInput, body));
  }
  @Post('cases')
  createCase(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.policy.createCase(actor, parse(caseInput, body));
  }
  @Post('cases/search')
  cases(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.policy.precedents(actor, parse(precedentInput, body));
  }
  @Post('truth/reconcile')
  reconcile(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.policy.reconcile(actor, parse(reconcileInput, body));
  }
}
