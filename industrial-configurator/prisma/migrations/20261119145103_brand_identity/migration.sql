-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "legalName" TEXT NOT NULL DEFAULT '',
    "taxId" TEXT NOT NULL DEFAULT '',
    "regNo" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "subdomain" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BrandIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "logoAssetId" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '',
    "secondaryColor" TEXT,
    "theme" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandIdentity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BLOB NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Asset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    CONSTRAINT "Configuration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Configuration" ("createdAt", "data", "id", "token", "userEmail", "userName", "userPhone") SELECT "createdAt", "data", "id", "token", "userEmail", "userName", "userPhone" FROM "Configuration";
DROP TABLE "Configuration";
ALTER TABLE "new_Configuration" RENAME TO "Configuration";
CREATE UNIQUE INDEX "Configuration_token_key" ON "Configuration"("token");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_subdomain_key" ON "Organization"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "BrandIdentity_organizationId_key" ON "BrandIdentity"("organizationId");

-- CreateIndex
CREATE INDEX "Asset_organizationId_idx" ON "Asset"("organizationId");

-- Default organization (fixed id, idempotent). Its name is empty on purpose: branding falls back
-- displayName -> organization name -> BRAND_NAME env -> built-in default, so env keeps working until the admin sets a name.
INSERT OR IGNORE INTO "Organization" ("id", "name", "updatedAt") VALUES ('default', '', CURRENT_TIMESTAMP);

-- COPY (not move) the existing AppSetting "uiTheme" into the default organization's BrandIdentity.theme.
-- The AppSetting table and row stay in place; settings.ts falls back to them when the BrandIdentity theme is empty.
INSERT OR IGNORE INTO "BrandIdentity" ("id", "organizationId", "theme", "updatedAt")
SELECT 'default', 'default', COALESCE((SELECT "value" FROM "AppSetting" WHERE "key" = 'uiTheme'), '{}'), CURRENT_TIMESTAMP;
