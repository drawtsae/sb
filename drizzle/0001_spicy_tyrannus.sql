PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cues` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`song_id` text,
	`start_sec` real DEFAULT 0 NOT NULL,
	`end_sec` real,
	`fade_in_sec` real,
	`fade_out_sec` real,
	`volume` integer DEFAULT 100 NOT NULL,
	`on_end` text DEFAULT 'resume_background' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cues_volume_check" CHECK("__new_cues"."volume" BETWEEN 0 AND 100),
	CONSTRAINT "cues_kind_check" CHECK("__new_cues"."kind" IN ('song','background')),
	CONSTRAINT "cues_on_end_check" CHECK("__new_cues"."on_end" IN ('resume_background','stop')),
	CONSTRAINT "cues_song_id_check" CHECK("__new_cues"."kind" <> 'song' OR "__new_cues"."song_id" IS NOT NULL),
	CONSTRAINT "cues_end_after_start_check" CHECK("__new_cues"."end_sec" IS NULL OR "__new_cues"."end_sec" > "__new_cues"."start_sec"),
	CONSTRAINT "cues_start_check" CHECK("__new_cues"."start_sec" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_cues`("id", "event_id", "position", "kind", "name", "song_id", "start_sec", "end_sec", "fade_in_sec", "fade_out_sec", "volume", "on_end", "note") SELECT "id", "event_id", "position", "kind", "name", "song_id", "start_sec", "end_sec", "fade_in_sec", "fade_out_sec", "volume", "on_end", "note" FROM `cues`;--> statement-breakpoint
DROP TABLE `cues`;--> statement-breakpoint
ALTER TABLE `__new_cues` RENAME TO `cues`;--> statement-breakpoint
PRAGMA foreign_keys=ON;