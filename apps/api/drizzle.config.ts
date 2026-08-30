import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    /* 이 PC의 5432는 다른 스택이 쓰고 있다. docker-compose.yml과 같은 5433이 기본이다 */
    url: process.env.DATABASE_URL ?? 'postgres://aas:aas@localhost:5433/aas',
  },
} satisfies Config;
