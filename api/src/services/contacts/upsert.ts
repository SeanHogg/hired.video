/**
 * Create-or-update a contact for an owner. Same email (case-insensitive) is
 * the same contact; otherwise a new row is created, linked to a platform
 * user with that email, and reconciled against likely duplicates.
 */
import type { Repos } from "../../repositories/index.js";
import type { ContactRow, ContactPatch } from "../../repositories/contactsRepository.js";
import { normalizeEmail, type ContactLifecycle, type ContactSource } from "../../../../shared/contacts.js";
import { fillMissing, reconcileContact, type ReconcileOutcome } from "./merge.js";

export type UpsertDeps = Pick<Repos, "contacts" | "personMerge" | "users">;

export interface ContactFields {
  email?: string | null;
  fullName?: string | null;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  notes?: string | null;
}

export interface UpsertContactInput extends ContactFields {
  source: ContactSource;
  lifecycle?: ContactLifecycle;
}

export interface UpsertContactResult {
  contact: ContactRow;
  created: boolean;
  reconcile: ReconcileOutcome;
}

function clean(fields: ContactFields): ContactFields {
  const out: ContactFields = {};
  for (const [key, value] of Object.entries(fields) as [keyof ContactFields, unknown][]) {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  if (out.email) out.email = normalizeEmail(out.email);
  return out;
}

async function linkedUserIdFor(deps: UpsertDeps, email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const user = await deps.users.findByEmail(email);
  return user?.id ?? null;
}

/** Automatic upsert (inbox, sourcing, imports): existing values win, so a
 *  machine-captured email never overwrites what the owner typed. */
export async function upsertContact(
  deps: UpsertDeps,
  ownerUserId: string,
  input: UpsertContactInput,
): Promise<UpsertContactResult> {
  const fields = clean(input);
  if (!fields.email && !fields.fullName) {
    throw new Error("A contact needs an email or a name");
  }
  const lifecycle = input.lifecycle ?? "contact";

  if (fields.email) {
    const existing = await deps.contacts.findByEmail(ownerUserId, fields.email);
    if (existing) {
      const patch: ContactPatch = fillMissing(existing, { ...fields, lifecycle });
      if (!existing.linkedUserId) {
        const linked = await linkedUserIdFor(deps, fields.email);
        if (linked) patch.linkedUserId = linked;
      }
      const contact = Object.keys(patch).length
        ? ((await deps.contacts.update(ownerUserId, existing.id, patch)) ?? existing)
        : existing;
      return { contact, created: false, reconcile: { kind: "none" } };
    }
  }

  const contact = await deps.contacts.insert({
    ownerUserId,
    ...fields,
    lifecycle,
    source: input.source,
    linkedUserId: await linkedUserIdFor(deps, fields.email),
  });
  const reconcile = await reconcileContact(deps, ownerUserId, contact);
  return {
    contact: reconcile.kind === "merged" ? reconcile.into : contact,
    created: reconcile.kind !== "merged",
    reconcile,
  };
}

/** Owner edit: provided values replace stored ones. Re-links the platform
 *  user when the email changes. */
export async function updateContact(
  deps: UpsertDeps,
  ownerUserId: string,
  id: string,
  fields: ContactFields & { lifecycle?: ContactLifecycle },
): Promise<ContactRow | null> {
  const patch: ContactPatch = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    (patch as Record<string, unknown>)[key] = typeof value === "string" ? value.trim() || null : value;
  }
  if (fields.email !== undefined) {
    patch.email = normalizeEmail(fields.email);
    patch.linkedUserId = await linkedUserIdFor(deps, patch.email);
  }
  return deps.contacts.update(ownerUserId, id, patch);
}
