ALTER TABLE "User" ADD COLUMN "favoriteCategories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "Budget" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "month" TEXT NOT NULL, "category" TEXT NOT NULL, "limitMinor" BIGINT NOT NULL CHECK ("limitMinor" > 0)
);
CREATE UNIQUE INDEX "Budget_userId_month_category_key" ON "Budget"("userId", "month", "category");
CREATE TABLE "RecurringPayment" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "name" TEXT NOT NULL, "category" TEXT NOT NULL, "amountMinor" BIGINT NOT NULL CHECK ("amountMinor" > 0),
 "frequency" TEXT NOT NULL CHECK ("frequency" IN ('weekly','monthly','yearly')),
 "nextDate" DATE NOT NULL, "anchorDay" INTEGER NOT NULL CHECK ("anchorDay" BETWEEN 1 AND 31), "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX "RecurringPayment_userId_nextDate_idx" ON "RecurringPayment"("userId", "nextDate");
