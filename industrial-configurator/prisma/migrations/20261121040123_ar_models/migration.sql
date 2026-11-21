-- CreateTable
CREATE TABLE "ConfigurationArModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configurationId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "bytes" BLOB NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConfigurationArModel_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "Configuration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Configuration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userEmail" TEXT,
    "userName" TEXT,
    "userPhone" TEXT,
    "organizationId" TEXT,
    "brandingSnapshot" JSONB,
    "arViews" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Configuration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Configuration" ("brandingSnapshot", "createdAt", "data", "id", "organizationId", "token", "userEmail", "userName", "userPhone") SELECT "brandingSnapshot", "createdAt", "data", "id", "organizationId", "token", "userEmail", "userName", "userPhone" FROM "Configuration";
DROP TABLE "Configuration";
ALTER TABLE "new_Configuration" RENAME TO "Configuration";
CREATE UNIQUE INDEX "Configuration_token_key" ON "Configuration"("token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ConfigurationArModel_configurationId_format_key" ON "ConfigurationArModel"("configurationId", "format");
