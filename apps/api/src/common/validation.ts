import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({ error: 'INVALID_INPUT', issues: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
  }
  return result.data;
}
