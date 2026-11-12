// Prüfung dessen, was über die Leitung kommt. Der Worker traut keiner Anfrage: Jede wird hier gegen
// ein Schema geprüft, bevor eine Regel sie sieht. Die Typen selbst stehen in actions.ts, api.ts und
// model.ts; die Typangabe an jedem Schema sorgt dafür, dass beide nicht auseinanderlaufen.
//
// zod/mini statt zod: Der Worker soll klein bleiben (10 ms CPU je Anfrage im Gratis-Tarif).
import * as z from 'zod/mini';
import type { Action } from './actions.ts';
import type { CreateHouseRequest, JoinHouseRequest, PushSubscribeRequest, SyncRequest } from './api.ts';
import { LIMITS } from './limits.ts';
import type { KnowMeAnswer } from './model.ts';

const trimmed = (max: number) => z.string().check(z.trim(), z.minLength(1), z.maxLength(max));
const ref = z.string().check(z.minLength(1), z.maxLength(80));
const count = z.int().check(z.positive());

const knowMeAnswer: z.ZodMiniType<KnowMeAnswer> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('choice'), option: z.int().check(z.gte(0), z.lte(9)) }),
  z.strictObject({ kind: z.literal('text'), text: trimmed(LIMITS.knowMeTextLength) }),
]);

// Jede Aktion trägt ihre auf dem Gerät erzeugte id und die Gerätezeit.
const meta = {
  id: z.string().check(z.regex(/^[A-Za-z0-9-]{8,64}$/)),
  at: z.string().check(z.maxLength(40)),
};

export const actionSchema: z.ZodMiniType<Action> = z.discriminatedUnion('type', [
  z.strictObject({ ...meta, type: z.literal('puzzle.solve'), taskId: ref }),
  z.strictObject({ ...meta, type: z.literal('knowme.submit'), taskId: ref, own: knowMeAnswer, guess: knowMeAnswer }),
  z.strictObject({ ...meta, type: z.literal('reallife.confirm'), taskId: ref }),
  z.strictObject({ ...meta, type: z.literal('build.choose'), turn: count, pieceId: ref }),
  z.strictObject({ ...meta, type: z.literal('build.place'), turn: count, spotId: ref }),
  z.strictObject({ ...meta, type: z.literal('piece.move'), pieceId: ref, spotId: ref }),
  z.strictObject({ ...meta, type: z.literal('milestone.seen'), milestone: count }),
  z.strictObject({ ...meta, type: z.literal('coupon.deposit'), text: trimmed(LIMITS.couponTextLength) }),
  z.strictObject({ ...meta, type: z.literal('coupon.requestRedeem'), couponId: ref }),
  z.strictObject({ ...meta, type: z.literal('coupon.confirmRedeem'), couponId: ref }),
  z.strictObject({ ...meta, type: z.literal('test.completeTask') }),
]);

export const createHouseSchema: z.ZodMiniType<CreateHouseRequest> = z.strictObject({ name: trimmed(LIMITS.nameLength) });

export const joinHouseSchema: z.ZodMiniType<JoinHouseRequest> = z.strictObject({
  code: z.string().check(z.maxLength(40)),
  name: trimmed(LIMITS.nameLength),
});

export const syncSchema: z.ZodMiniType<SyncRequest> = z.strictObject({
  actions: z.array(actionSchema).check(z.maxLength(LIMITS.actionsPerSync)),
});

const base64url = (min: number, max: number) => z.string().check(z.regex(/^[A-Za-z0-9_-]+$/), z.minLength(min), z.maxLength(max));

export const pushSubscribeSchema: z.ZodMiniType<PushSubscribeRequest> = z.strictObject({
  endpoint: z.url().check(z.maxLength(1000)),
  // p256dh: 65 Byte (unkomprimierter P-256-Punkt), auth: 16 Byte – jeweils base64url ohne Auffüllung.
  keys: z.strictObject({ p256dh: base64url(87, 88), auth: base64url(22, 24) }),
});
