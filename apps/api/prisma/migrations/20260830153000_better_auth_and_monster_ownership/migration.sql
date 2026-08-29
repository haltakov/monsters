-- Better Auth accounts plus durable player ownership and public lineage.

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "role" TEXT NOT NULL DEFAULT 'user',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Verification" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3),
  CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

ALTER TABLE "GuestPlayer" ADD COLUMN "userId" TEXT;
ALTER TABLE "Monster"
  ADD COLUMN "nicknameKey" TEXT,
  ADD COLUMN "accountOwnerId" TEXT,
  ADD COLUMN "originType" TEXT NOT NULL DEFAULT 'wild',
  ADD COLUMN "clonedFromId" TEXT;

-- Existing owned monsters were created by a player; parented monsters by mating.
UPDATE "Monster" SET "originType" = 'player' WHERE "ownerId" IS NOT NULL;
UPDATE "Monster" SET "originType" = 'mating' WHERE "parentAId" IS NOT NULL OR "parentBId" IS NOT NULL;

-- Reserve existing player nicknames. Historical collisions get a visible suffix.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY LOWER(BTRIM("name")) ORDER BY "createdAt", "id"
  ) AS duplicate_number
  FROM "Monster"
  WHERE "ownerId" IS NOT NULL
)
UPDATE "Monster" AS monster
SET "name" = CASE
      WHEN ranked.duplicate_number = 1 THEN monster."name"
      ELSE LEFT(monster."name", 18) || ' #' || ranked.duplicate_number::text
    END
FROM ranked
WHERE monster."id" = ranked."id";

UPDATE "Monster"
SET "nicknameKey" = LOWER(REGEXP_REPLACE(BTRIM("name"), '[[:space:]]+', ' ', 'g'))
WHERE "ownerId" IS NOT NULL;

CREATE UNIQUE INDEX "Monster_nicknameKey_key" ON "Monster"("nicknameKey");
CREATE INDEX "GuestPlayer_userId_idx" ON "GuestPlayer"("userId");
CREATE INDEX "Monster_accountOwnerId_idx" ON "Monster"("accountOwnerId");
CREATE INDEX "Monster_originType_idx" ON "Monster"("originType");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestPlayer" ADD CONSTRAINT "GuestPlayer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Monster" ADD CONSTRAINT "Monster_accountOwnerId_fkey"
  FOREIGN KEY ("accountOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
