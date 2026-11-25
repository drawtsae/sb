-- Legacy rows from the old NOT NULL DEFAULT 0 columns: 0 meant "unset", i.e. follow the event settings.
UPDATE `cues` SET `fade_in_sec` = NULL WHERE `fade_in_sec` = 0;--> statement-breakpoint
UPDATE `cues` SET `fade_out_sec` = NULL WHERE `fade_out_sec` = 0;
