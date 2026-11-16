import "dotenv/config";
import path from "path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma";
import { DEFAULT_PRICES } from "../src/lib/pricing";

async function main() {
  const dbPath = process.env.DATABASE_URL?.replace("file:", "") || "./prisma/dev.db";
  const adapter = new PrismaBetterSqlite3({
    url: `file:${path.resolve(process.cwd(), dbPath)}`,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    if ((await prisma.prices.count()) === 0) {
      await prisma.prices.create({ data: DEFAULT_PRICES });
      console.log("Seeded default prices.");
    } else {
      console.log("Prices already present; nothing to seed.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
