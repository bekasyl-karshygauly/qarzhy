-- Additive migration: existing transactions keep their history and remain unassigned.
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "openingMinor" BIGINT NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Account_kind_check" CHECK ("kind" IN ('cash', 'card', 'deposit')),
    CONSTRAINT "Account_name_check" CHECK (char_length(btrim("name")) BETWEEN 2 AND 60),
    CONSTRAINT "Account_openingMinor_check" CHECK ("openingMinor" BETWEEN 0 AND 999999999999)
);
CREATE UNIQUE INDEX "Account_id_userId_key" ON "Account"("id", "userId");
CREATE UNIQUE INDEX "Account_userId_requestId_key" ON "Account"("userId", "requestId");
CREATE INDEX "Account_userId_archived_idx" ON "Account"("userId", "archived");
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD COLUMN "accountId" TEXT;
CREATE INDEX "Transaction_userId_accountId_date_idx" ON "Transaction"("userId", "accountId", "date");
-- Composite owner keys also protect writes made outside the HTTP API.
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Transfer_amountMinor_check" CHECK ("amountMinor" BETWEEN 1 AND 999999999999),
    CONSTRAINT "Transfer_distinct_accounts_check" CHECK ("fromAccountId" <> "toAccountId"),
    CONSTRAINT "Transfer_note_check" CHECK (char_length("note") <= 300),
    CONSTRAINT "Transfer_date_check" CHECK ("date" BETWEEN DATE '2000-01-01' AND DATE '2100-12-31')
);
CREATE UNIQUE INDEX "Transfer_userId_requestId_key" ON "Transfer"("userId", "requestId");
CREATE INDEX "Transfer_userId_date_idx" ON "Transfer"("userId", "date");
CREATE INDEX "Transfer_userId_fromAccountId_idx" ON "Transfer"("userId", "fromAccountId");
CREATE INDEX "Transfer_userId_toAccountId_idx" ON "Transfer"("userId", "toAccountId");
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromAccountId_userId_fkey" FOREIGN KEY ("fromAccountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toAccountId_userId_fkey" FOREIGN KEY ("toAccountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE NO ACTION ON UPDATE NO ACTION;
