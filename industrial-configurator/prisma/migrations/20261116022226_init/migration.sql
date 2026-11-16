-- CreateTable
CREATE TABLE "Configuration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userEmail" TEXT,
    "userName" TEXT,
    "userPhone" TEXT
);

-- CreateTable
CREATE TABLE "Prices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "structurePerM3" REAL NOT NULL,
    "foundationPerM2" REAL NOT NULL,
    "sandwichPerM2" REAL NOT NULL,
    "windowPerUnit" REAL NOT NULL,
    "doorPerUnit" REAL NOT NULL,
    "bigDoorPerUnit" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Configuration_token_key" ON "Configuration"("token");
