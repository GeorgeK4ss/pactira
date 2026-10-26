-- CreateTable
CREATE TABLE "DocumentSend" (
    "id" SERIAL NOT NULL,
    "organisationId" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentSend_organisationId_createdAt_idx" ON "DocumentSend"("organisationId", "createdAt");

-- AddForeignKey
ALTER TABLE "DocumentSend" ADD CONSTRAINT "DocumentSend_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A document counts as sent when it leaves DRAFT (emailed, or signing links generated), or is
-- created already past DRAFT (direct template links). Rows stay when the document is deleted.
CREATE FUNCTION "record_document_send"() RETURNS trigger AS $$
BEGIN
  IF NEW."type" = 'DOCUMENT' AND NEW."status" <> 'DRAFT'
     AND (TG_OP = 'INSERT' OR OLD."status" = 'DRAFT') THEN
    INSERT INTO "DocumentSend" ("organisationId", "envelopeId", "createdAt")
    SELECT t."organisationId", NEW."id", now() FROM "Team" t WHERE t."id" = NEW."teamId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Envelope_record_document_send_insert"
AFTER INSERT ON "Envelope"
FOR EACH ROW EXECUTE FUNCTION "record_document_send"();

CREATE TRIGGER "Envelope_record_document_send_update"
AFTER UPDATE OF "status" ON "Envelope"
FOR EACH ROW EXECUTE FUNCTION "record_document_send"();

-- Documents sent before this existed, dated by when they were created.
INSERT INTO "DocumentSend" ("organisationId", "envelopeId", "createdAt")
SELECT t."organisationId", e."id", e."createdAt"
FROM "Envelope" e JOIN "Team" t ON t."id" = e."teamId"
WHERE e."type" = 'DOCUMENT' AND e."status" <> 'DRAFT';
