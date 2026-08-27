-- CreateIndex
CREATE INDEX "AppointmentSlot_createdByAdminId_idx" ON "AppointmentSlot"("createdByAdminId");

-- CreateIndex
CREATE INDEX "CandidateApplication_reviewedByAdminId_idx" ON "CandidateApplication"("reviewedByAdminId");

-- CreateIndex
CREATE INDEX "FileAccessRequest_decidedByAdminId_idx" ON "FileAccessRequest"("decidedByAdminId");

-- CreateIndex
CREATE INDEX "OpenPosition_createdByAdminId_idx" ON "OpenPosition"("createdByAdminId");

-- CreateIndex
CREATE INDEX "Service_updatedByAdminId_idx" ON "Service"("updatedByAdminId");

-- CreateIndex
CREATE INDEX "ServiceFile_uploadedByAdminId_idx" ON "ServiceFile"("uploadedByAdminId");

-- CreateIndex
CREATE INDEX "ServiceRequest_serviceId_idx" ON "ServiceRequest"("serviceId");
