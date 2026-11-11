// Export und Import des Gerätestands als Datei: Token, letzte Sicht und wartende Aktionen.
// Damit lässt sich der eigene Platz im Haus sichern und auf ein neues Gerät mitnehmen.
// Die Datei enthält das geheime Token – wer sie hat, kann als dieser Spieler handeln.
import * as z from 'zod/mini';
import type { Action } from '../../shared/actions.ts';
import type { HouseView } from '../../shared/model.ts';
import { actionSchema } from '../../shared/wire.ts';
import { DEFAULT_SETTINGS, type DeviceRecord, type Stored } from './store.ts';

export const DEVICE_FILE_FORMAT = 'paartrip-device';
export const DEVICE_FILE_VERSION = 1;

export interface DeviceFile {
  format: typeof DEVICE_FILE_FORMAT;
  version: typeof DEVICE_FILE_VERSION;
  exportedAt: string;
  device: DeviceRecord;
  view: HouseView;
  queue: Action[];
}

/** Fehler mit einem Text, der dem Nutzer gezeigt werden kann. */
export class DeviceFileError extends Error {}

export function buildDeviceFile(stored: Stored, exportedAt: Date): DeviceFile {
  if (!stored.device || !stored.view) throw new DeviceFileError('This phone is not linked to a house yet.');
  return {
    format: DEVICE_FILE_FORMAT,
    version: DEVICE_FILE_VERSION,
    exportedAt: exportedAt.toISOString(),
    device: stored.device,
    view: stored.view,
    queue: stored.queue,
  };
}

export function deviceFileName(exportedAt: Date): string {
  return `paartrip-backup-${exportedAt.toISOString().slice(0, 10)}.json`;
}

const slot = z.enum(['a', 'b']);

const fileSchema = z.object({
  format: z.literal(DEVICE_FILE_FORMAT),
  version: z.literal(DEVICE_FILE_VERSION),
  device: z.strictObject({ token: z.string().check(z.minLength(20), z.maxLength(200)), houseId: z.string().check(z.minLength(1)), slot }),
  // Die Sicht wird nach dem Import sofort vom Server ersetzt; hier genügt, dass sie zum Gerät gehört.
  view: z.looseObject({ houseId: z.string(), you: slot, players: z.looseObject({}), coupons: z.array(z.unknown()) }),
  queue: z.array(actionSchema),
});

/** Liest eine Exportdatei. Einstellungen werden nicht übernommen – Mitteilungen gelten je Gerät. */
export function parseDeviceFile(text: string): Stored {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DeviceFileError("This file can't be read. Please choose a PaarTrip backup file.");
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) throw new DeviceFileError("This doesn't look like a PaarTrip backup file.");
  const { device, view, queue } = parsed.data;
  if (view.houseId !== device.houseId || view.you !== device.slot) {
    throw new DeviceFileError("This backup file is damaged: its parts don't belong together.");
  }
  return { device, view: view as unknown as HouseView, queue, settings: { ...DEFAULT_SETTINGS } };
}
