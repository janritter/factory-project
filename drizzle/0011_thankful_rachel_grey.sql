ALTER TABLE `refunds` RENAME TO `refund_requests`;--> statement-breakpoint
DROP INDEX `refunds_purchase_idx`;--> statement-breakpoint
CREATE INDEX `refund_requests_purchase_idx` ON `refund_requests` (`purchase_id`);--> statement-breakpoint
ALTER TABLE `refund_requests` ADD `decline_reason` text;--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`refund_request_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`refund_request_id`) REFERENCES `refund_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refunds_refund_request_id_unique` ON `refunds` (`refund_request_id`);--> statement-breakpoint
INSERT INTO `refunds` (`refund_request_id`, `amount`, `status`, `created_at`)
SELECT rr.`id`, p.`amount_paid`, 'pending', COALESCE(rr.`resolved_at`, rr.`requested_at`)
FROM `refund_requests` rr JOIN `purchases` p ON p.`id` = rr.`purchase_id`
WHERE rr.`status` = 'approved';--> statement-breakpoint
ALTER TABLE `refund_requests` DROP COLUMN `amount_refunded`;
