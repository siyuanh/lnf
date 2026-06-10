import { z } from "zod";
import { TagState } from "./partner.js";

export const SignupRequest = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});
export type SignupRequest = z.infer<typeof SignupRequest>;

export const SignupResponse = z.object({
  caregiverId: z.string().uuid(),
});
export type SignupResponse = z.infer<typeof SignupResponse>;

export const Person = z.object({
  id: z.string().uuid(),
  nickname: z.string(),
  publicNote: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type Person = z.infer<typeof Person>;

export const PersonCreateRequest = z.object({
  nickname: z.string().min(1).max(80),
  publicNote: z.string().max(200).optional(),
});
export type PersonCreateRequest = z.infer<typeof PersonCreateRequest>;

export const TagPairRequest = z.object({
  protectedPersonId: z.string().uuid(),
  label: z.string().max(80).optional(),
});
export type TagPairRequest = z.infer<typeof TagPairRequest>;

export const TagPairResponse = z.object({
  code: z.string(),
  state: TagState,
  protectedPersonId: z.string().uuid(),
  label: z.string().nullable(),
});
export type TagPairResponse = z.infer<typeof TagPairResponse>;

export const MeResponse = z.object({
  caregiverId: z.string().uuid(),
  email: z.string().email(),
});
export type MeResponse = z.infer<typeof MeResponse>;
