-- CreateTable
CREATE TABLE "ColorOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "component" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ral" TEXT NOT NULL DEFAULT '',
    "hex" TEXT NOT NULL,
    "surcharge" REAL NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "ColorOption_component_idx" ON "ColorOption"("component");
