// يحمّل .env من جذر المستودع قبل أي اختبار — DATABASE_URL خاصةً
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
