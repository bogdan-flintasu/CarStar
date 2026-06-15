import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@/generated/prisma';
import path from 'path';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './prisma/dev.db';
  const resolvedPath = path.resolve(process.cwd(), dbPath);
  
  const adapter = new PrismaBetterSqlite3({
    url: `file:${resolvedPath}`,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
