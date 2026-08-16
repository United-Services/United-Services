-- DropIndex
DROP INDEX "Appointment_clientId_idx";

-- DropIndex
DROP INDEX "AuditLog_actorUserId_idx";

-- DropIndex
DROP INDEX "FileAccessRequest_clientId_idx";

-- DropIndex
DROP INDEX "OpenPosition_isOpen_idx";

-- DropIndex
DROP INDEX "ServiceRequest_clientId_idx";

-- CreateIndex
CREATE INDEX "Appointment_clientId_createdAt_idx" ON "Appointment"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FileAccessRequest_clientId_requestedAt_idx" ON "FileAccessRequest"("clientId", "requestedAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_clientId_createdAt_idx" ON "ServiceRequest"("clientId", "createdAt");

-- CreateIndex (partial: only open positions are ever queried by the public
-- listing endpoint, so closed positions don't need to be carried in the index)
CREATE INDEX "idx_open_positions_active" ON "OpenPosition"("createdAt") WHERE "isOpen" = true;
