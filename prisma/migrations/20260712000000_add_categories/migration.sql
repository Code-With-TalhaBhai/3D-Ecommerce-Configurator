-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- Seed the default "Others" category. Fixed id so upload/backfill paths can
-- reference it deterministically; every product without an explicit category
-- lands here.
INSERT INTO "Category" ("id", "name", "slug", "createdAt")
VALUES ('cat_others_default', 'Others', 'others', CURRENT_TIMESTAMP);

-- AlterTable: add the column nullable first so existing rows survive.
ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT;

-- Backfill every existing product to the default "Others" category.
UPDATE "Product" SET "categoryId" = 'cat_others_default' WHERE "categoryId" IS NULL;

-- Now enforce NOT NULL: every product must belong to a category.
ALTER TABLE "Product" ALTER COLUMN "categoryId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
