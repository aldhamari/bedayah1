// ══════════════════════════════════════════════════════════════
//  apps/api/src/tenancy/tenant-context.middleware.ts
//
//  يفتح سياق ALS فارغًا حول كل طلب HTTP.
//
//  ترتيب Nest: middleware ← guards ← interceptors ← handler.
//  فالوسيط يفتح السياق (بمستأجر null)، ثم يملؤه JwtAuthGuard بعد
//  التحقق. لا نفتحه في interceptor لأن next.handle() يبني الـObservable
//  فقط، والتنفيذ الفعلي يقع عند الاشتراك — أي خارج نطاق als.run().
// ══════════════════════════════════════════════════════════════

import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly ctx: TenantContextService) {}

  use(_req: Request, _res: Response, next: NextFunction) {
    this.ctx.runForRequest(() => next());
  }
}
