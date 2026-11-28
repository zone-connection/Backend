-- AlterTable
-- CreateTable
CREATE TABLE "whatsapp_user_tags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'bg-slate-500 text-white',
    "source" TEXT NOT NULL DEFAULT 'custom',
    "funilSlug" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_user_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_user_chat_tags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_user_chat_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_user_tags_userId_name_key" ON "whatsapp_user_tags"("userId", "name");

-- CreateIndex
CREATE INDEX "whatsapp_user_tags_tenantId_userId_idx" ON "whatsapp_user_tags"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_user_chat_tags_userId_tagId_chatId_key" ON "whatsapp_user_chat_tags"("userId", "tagId", "chatId");

-- CreateIndex
CREATE INDEX "whatsapp_user_chat_tags_userId_chatId_idx" ON "whatsapp_user_chat_tags"("userId", "chatId");

-- AddForeignKey
ALTER TABLE "whatsapp_user_tags" ADD CONSTRAINT "whatsapp_user_tags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_user_tags" ADD CONSTRAINT "whatsapp_user_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_user_chat_tags" ADD CONSTRAINT "whatsapp_user_chat_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_user_chat_tags" ADD CONSTRAINT "whatsapp_user_chat_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "whatsapp_user_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
