-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "BillingInvoiceKind" AS ENUM ('RENEWAL', 'SEATS');

-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "CryptoPaymentStatus" AS ENUM ('PENDING', 'SEEN', 'PAID', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "extraSeats" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "interval" "BillingInterval",
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'stripe';

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "kind" "BillingInvoiceKind" NOT NULL,
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "interval" "BillingInterval" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "extraSeats" INTEGER NOT NULL DEFAULT 0,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidVia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoPaymentRequest" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "status" "CryptoPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "seenAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoPaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoTransfer" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "blockNumber" BIGINT,
    "blockTime" TIMESTAMP(3),
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "matchedRequestId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CryptoTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoWatchCursor" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lastBlock" BIGINT,
    "lastTimestampMs" BIGINT,
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "CryptoWatchCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingInvoice_organisationId_status_idx" ON "BillingInvoice"("organisationId", "status");

-- CreateIndex
CREATE INDEX "CryptoPaymentRequest_network_asset_toAddress_status_idx" ON "CryptoPaymentRequest"("network", "asset", "toAddress", "status");

-- CreateIndex
CREATE INDEX "CryptoPaymentRequest_invoiceId_idx" ON "CryptoPaymentRequest"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoTransfer_matchedRequestId_key" ON "CryptoTransfer"("matchedRequestId");

-- CreateIndex
CREATE INDEX "CryptoTransfer_network_asset_toAddress_matchedRequestId_idx" ON "CryptoTransfer"("network", "asset", "toAddress", "matchedRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoTransfer_network_txHash_logIndex_key" ON "CryptoTransfer"("network", "txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoWatchCursor_network_asset_address_key" ON "CryptoWatchCursor"("network", "asset", "address");

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoPaymentRequest" ADD CONSTRAINT "CryptoPaymentRequest_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoPaymentRequest" ADD CONSTRAINT "CryptoPaymentRequest_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoTransfer" ADD CONSTRAINT "CryptoTransfer_matchedRequestId_fkey" FOREIGN KEY ("matchedRequestId") REFERENCES "CryptoPaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Two open requests to the same address must never ask for the same amount: the cents are how a
-- transfer is matched to its request.
CREATE UNIQUE INDEX "CryptoPaymentRequest_open_amount_key" ON "CryptoPaymentRequest"("network", "asset", "toAddress", "amount") WHERE "status" IN ('PENDING', 'SEEN');
