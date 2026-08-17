-- CreateEnum
CREATE TYPE "TryOnAnchor" AS ENUM ('WRIST', 'FOOT');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "tryOnAnchor" "TryOnAnchor";
