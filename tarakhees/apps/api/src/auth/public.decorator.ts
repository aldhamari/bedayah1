import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * يستثني مسارًا من JwtAuthGuard المسجَّل عالميًا.
 * الحراسة مفعّلة افتراضيًا على كل شيء، والاستثناء يُكتب صراحةً —
 * فنسيان الحارس لا ينتج مسارًا مفتوحًا.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
