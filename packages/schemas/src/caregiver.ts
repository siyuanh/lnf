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
  contactId: z.string().uuid(),
  label: z.string().max(80).optional(),
});
export type TagPairRequest = z.infer<typeof TagPairRequest>;

export const TagPairResponse = z.object({
  code: z.string(),
  state: TagState,
  contactId: z.string().uuid(),
  label: z.string().nullable(),
});
export type TagPairResponse = z.infer<typeof TagPairResponse>;

export const MeResponse = z.object({
  caregiverId: z.string().uuid(),
  email: z.string().email(),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const ContactKind = z.enum(["phone", "email", "address"]);
export type ContactKind = z.infer<typeof ContactKind>;

// E.164-ish: leading '+' then 8–15 digits. Accept spaces/dashes at the
// boundary and normalize on the server. Deliberately loose: strict E.164
// belongs in the SMS provider layer, not signup validation.
const phonePattern = /^\+?[\d\s\-().]{7,20}$/;

// value shape depends on kind: we accept anything for `address` and let the
// UI treat it as a single free-form line for v1.
const CONTACT_VALUE_MAX = 200;

export const Contact = z.object({
  id: z.string().uuid(),
  kind: ContactKind,
  label: z.string().nullable(),
  value: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Contact = z.infer<typeof Contact>;

export const ContactCreateRequest = z
  .object({
    kind: ContactKind,
    label: z.string().max(80).optional(),
    value: z.string().min(1).max(CONTACT_VALUE_MAX),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "phone" && !phonePattern.test(v.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "invalid phone",
      });
    }
    if (v.kind === "email" && !z.string().email().safeParse(v.value).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "invalid email",
      });
    }
  });
export type ContactCreateRequest = z.infer<typeof ContactCreateRequest>;

// PATCH: caller may change label and/or value but not the kind. Kind belongs
// to the row identity — flipping phone→address on the same row would let a
// verified channel silently move under a different verification regime.
export const ContactUpdateRequest = z.object({
  label: z.string().max(80).nullable().optional(),
  value: z.string().min(1).max(CONTACT_VALUE_MAX).optional(),
});
export type ContactUpdateRequest = z.infer<typeof ContactUpdateRequest>;

// A tag the caregiver has registered, as shown in their tag list. Carries a
// compact snapshot of the linked contact so the list renders without an extra
// per-row fetch. `registeredAt` is the tag's activation timestamp.
export const RegisteredTagSummary = z.object({
  code: z.string(),
  label: z.string().nullable(),
  state: TagState,
  contact: z
    .object({
      id: z.string().uuid(),
      kind: ContactKind,
      label: z.string().nullable(),
      value: z.string(),
    })
    .nullable(),
  registeredAt: z.string().datetime().nullable(),
});
export type RegisteredTagSummary = z.infer<typeof RegisteredTagSummary>;

export const RegisteredTagListResponse = z.object({
  tags: z.array(RegisteredTagSummary),
});
export type RegisteredTagListResponse = z.infer<typeof RegisteredTagListResponse>;

// Full detail for one registered tag: the tag fields plus the complete linked
// contact (with created/updated timestamps). Contact may be null if the tag
// was registered under the legacy protected-person model and never re-paired.
export const TagDetailResponse = z.object({
  code: z.string(),
  label: z.string().nullable(),
  state: TagState,
  registeredAt: z.string().datetime().nullable(),
  contact: Contact.nullable(),
});
export type TagDetailResponse = z.infer<typeof TagDetailResponse>;

// Optional phone captured at signup time. Same lenient pattern as contacts.
export const SignupPhone = z.string().regex(phonePattern);
export type SignupPhone = z.infer<typeof SignupPhone>;
