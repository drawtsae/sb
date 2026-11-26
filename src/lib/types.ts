export type CueKind = 'song' | 'background';
export type Transition = 'crossfade' | 'fade_out_in';
export type OnEnd = 'resume_background' | 'stop';
export interface Folder { id: string; name: string; parentId: string | null }
export interface Song {
  id: string; folderId: string | null; title: string; artist: string | null; durationSec: number;
  fileName: string; fileSize: number; mimeType: string; contentHash: string;
}
export interface Cue {
  id: string; position: number; kind: CueKind; name: string; songId: string | null;
  startSec: number; endSec: number | null; fadeInSec: number | null; fadeOutSec: number | null;
  volume: number; /* 0–100 */ onEnd: OnEnd; note: string;
  /** null = use the event's defaultTransition */
  transition: Transition | null;
}
export interface EventSettings {
  cueFadeSec: number; bgCrossfadeSec: number; stopFadeSec: number;
  bgVolume: number; masterVolume: number; /* 0–1 */ shuffle: boolean;
  defaultTransition: Transition;
}
export const DEFAULT_SETTINGS: EventSettings =
  { cueFadeSec: 3, bgCrossfadeSec: 4, stopFadeSec: 3, bgVolume: 0.7, masterVolume: 0.9, shuffle: false, defaultTransition: 'crossfade' };
export interface EventRecord { id: string; name: string; eventDate: string | null; settings: EventSettings; updatedAt: string }
export interface EventDetail { event: EventRecord; background: { id: string; songId: string }[]; cues: Cue[]; songs: Record<string, Song> }
export interface ShowSnapshot {
  version: 1; eventId: string; eventName: string; takenAt: string;
  settings: EventSettings; songs: Record<string, Song>; background: string[]; /* songIds */ cues: Cue[];
}
