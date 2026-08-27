-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "World_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Monster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "dna" JSONB NOT NULL,
    "position" JSONB,
    "energy" INTEGER NOT NULL DEFAULT 100,
    "worldId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Monster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Monster_worldId_idx" ON "Monster"("worldId");

-- AddForeignKey
ALTER TABLE "Monster" ADD CONSTRAINT "Monster_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;
