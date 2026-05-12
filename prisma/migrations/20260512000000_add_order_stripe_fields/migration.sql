-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "promoCode" TEXT,
ADD COLUMN     "stripeSessionId" TEXT,
ADD COLUMN     "subtotal" DECIMAL(10,2) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeSessionId_key" ON "Order"("stripeSessionId");
