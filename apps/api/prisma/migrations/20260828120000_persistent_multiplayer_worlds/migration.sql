-- Persistent multiplayer worlds (stages 1-4).
--
-- Purely additive: no column or table is dropped and every new column either
-- has a default or is nullable, so it is safe against the existing schema.

-- AlterTable
ALTER TABLE "Monster" ADD COLUMN     "alive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "diedAt" TIMESTAMP(3),
ADD COLUMN     "generation" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mutations" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "parentAId" TEXT,
ADD COLUMN     "parentBId" TEXT;

-- AlterTable
ALTER TABLE "World" ADD COLUMN     "currentTick" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "simulatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- Backfill: pre-existing worlds keep their identity and get a stable slug.
UPDATE "World" SET "slug" = "id" WHERE "slug" IS NULL;
ALTER TABLE "World" ALTER COLUMN "slug" SET NOT NULL;

-- CreateTable
CREATE TABLE "GuestPlayer" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldMember" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "selectedMonsterId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldSnapshot" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "tick" INTEGER NOT NULL,
    "simulatedAt" TIMESTAMP(3) NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldEvent" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestPlayer_tokenHash_key" ON "GuestPlayer"("tokenHash");

-- CreateIndex
CREATE INDEX "WorldMember_guestId_idx" ON "WorldMember"("guestId");

-- CreateIndex
CREATE UNIQUE INDEX "WorldMember_worldId_guestId_key" ON "WorldMember"("worldId", "guestId");

-- CreateIndex
CREATE UNIQUE INDEX "WorldSnapshot_worldId_key" ON "WorldSnapshot"("worldId");

-- CreateIndex
CREATE INDEX "WorldEvent_worldId_createdAt_idx" ON "WorldEvent"("worldId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldEvent_worldId_type_idx" ON "WorldEvent"("worldId", "type");

-- CreateIndex
CREATE INDEX "Monster_ownerId_idx" ON "Monster"("ownerId");

-- CreateIndex
CREATE INDEX "Monster_worldId_alive_idx" ON "Monster"("worldId", "alive");

-- CreateIndex
CREATE UNIQUE INDEX "World_slug_key" ON "World"("slug");

-- AddForeignKey
ALTER TABLE "WorldMember" ADD CONSTRAINT "WorldMember_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldMember" ADD CONSTRAINT "WorldMember_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "GuestPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Monster" ADD CONSTRAINT "Monster_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "GuestPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldSnapshot" ADD CONSTRAINT "WorldSnapshot_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldEvent" ADD CONSTRAINT "WorldEvent_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

