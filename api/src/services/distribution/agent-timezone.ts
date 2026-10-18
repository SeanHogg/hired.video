/**
 * User timezone for posting-agent day/week windows.
 * Falls back to UTC when the account has none set.
 */
import { getDb } from "../../db/index.js";
import { UsersRepository } from "../../repositories/usersRepository.js";

export async function loadTimezone(userId: string): Promise<string> {
  return (await new UsersRepository(getDb()).findTimezone(userId)) || "UTC";
}
