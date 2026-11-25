CREATE TABLE `background_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`position` integer NOT NULL,
	`song_id` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `cues` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`song_id` text,
	`start_sec` real DEFAULT 0 NOT NULL,
	`end_sec` real,
	`fade_in_sec` real DEFAULT 0 NOT NULL,
	`fade_out_sec` real DEFAULT 0 NOT NULL,
	`volume` integer DEFAULT 100 NOT NULL,
	`on_end` text DEFAULT 'resume_background' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cues_volume_check" CHECK("cues"."volume" BETWEEN 0 AND 100),
	CONSTRAINT "cues_kind_check" CHECK("cues"."kind" IN ('song','background')),
	CONSTRAINT "cues_on_end_check" CHECK("cues"."on_end" IN ('resume_background','stop')),
	CONSTRAINT "cues_song_id_check" CHECK("cues"."kind" <> 'song' OR "cues"."song_id" IS NOT NULL),
	CONSTRAINT "cues_end_after_start_check" CHECK("cues"."end_sec" IS NULL OR "cues"."end_sec" > "cues"."start_sec"),
	CONSTRAINT "cues_start_check" CHECK("cues"."start_sec" >= 0)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`event_date` text,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text,
	`title` text NOT NULL,
	`artist` text DEFAULT '' NOT NULL,
	`duration_sec` real NOT NULL,
	`file_name` text NOT NULL,
	`file_size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`content_hash` text NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `songs_content_hash_idx` ON `songs` (`content_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);