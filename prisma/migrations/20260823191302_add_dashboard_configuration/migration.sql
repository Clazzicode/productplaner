-- CreateTable
CREATE TABLE "DashboardConfiguration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workingRole" TEXT NOT NULL,
    "widgetId" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashboardConfiguration_organizationId_workingRole_widgetId_key" ON "DashboardConfiguration"("organizationId", "workingRole", "widgetId");

-- AddForeignKey
ALTER TABLE "DashboardConfiguration" ADD CONSTRAINT "DashboardConfiguration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
