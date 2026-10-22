ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_positive_amount" CHECK ("amountMinor" > 0 AND "amountMinor" <= 999999999999);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_valid_type" CHECK ("type" IN ('income', 'expense'));
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_valid_amounts" CHECK ("targetMinor" > 0 AND "targetMinor" <= 999999999999 AND "savedMinor" >= 0 AND "savedMinor" <= "targetMinor");
ALTER TABLE "User" ADD COLUMN "aiConsentAt" TIMESTAMP(3), ADD COLUMN "voiceConsentAt" TIMESTAMP(3);
