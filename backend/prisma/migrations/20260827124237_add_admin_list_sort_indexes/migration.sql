-- CreateIndex
CREATE INDEX "FileAccessRequest_requestedAt_idx" ON "FileAccessRequest"("requestedAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_createdAt_idx" ON "ServiceRequest"("createdAt");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
