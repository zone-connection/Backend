ALTER TABLE "Empreendimento" ADD COLUMN "matchTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Empreendimento" ADD COLUMN "matchMuitoCompativeis" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Empreendimento" ADD COLUMN "matchInteressePrevio" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Empreendimento" ADD COLUMN "matchComputedAt" TIMESTAMP(3);
