import { UnprocessableEntityException } from '@nestjs/common';
import { z } from 'zod';

/**
 * يحوّل أخطاء Zod إلى 422 بشكل موحّد في كل المسارات.
 * الرسائل عربية لأنها تصل إلى المستخدم مباشرة في الواجهة.
 */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new UnprocessableEntityException({
      ok: false,
      errors: result.error.issues.map((i) => ({
        field: i.path.map(String).join('.'),
        message: i.message,
      })),
    });
  }
  return result.data;
}
