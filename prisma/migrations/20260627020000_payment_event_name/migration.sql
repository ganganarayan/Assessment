-- Configurable Meta event name fired on a verified paid unlock (default Purchase121).
ALTER TABLE "assessment" ADD COLUMN "paymentEventName" TEXT NOT NULL DEFAULT 'Purchase121';
