-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "workspaceType" TEXT NOT NULL DEFAULT 'team';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authUserId" UUID;

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authUserId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganizationMember_authUserId_idx" ON "OrganizationMember"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_authUserId_key" ON "OrganizationMember"("organizationId", "authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "User"("authUserId") ON DELETE CASCADE ON UPDATE CASCADE;

