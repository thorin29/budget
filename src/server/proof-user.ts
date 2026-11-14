import { decodeLoginProof } from "@/lib/auth/device-token";
import { sessionSecret } from "./session";

/** The user a valid login proof names, for rate-limit keys only. */
export async function decodeLoginProofUserId(proof: unknown): Promise<string | null> {
  return decodeLoginProof(proof, await sessionSecret())?.userId ?? null;
}
