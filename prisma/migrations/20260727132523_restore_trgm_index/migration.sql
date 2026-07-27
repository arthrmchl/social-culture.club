-- CreateIndex
CREATE INDEX "Work_titleNormalized_idx" ON "Work" USING GIN ("titleNormalized" gin_trgm_ops);
