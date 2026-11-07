import { Injectable } from '@nestjs/common';

/** Business validity clock. There is no request parameter or environment override. */
@Injectable()
export class Clock {
  now(): Date { return new Date(); }
}
