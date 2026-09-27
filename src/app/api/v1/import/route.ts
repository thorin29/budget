import {
  applyImport,
  buildPlan,
  listImportBatches,
  parseDocument,
  revertImport,
  validateAmounts,
} from "@/server/import";
import { fail, ok, readJson } from "@/server/http";
import { ValidationError } from "@/server/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok({ batches: await listImportBatches() });
  } catch (error) {
    return fail(error);
  }
}

/**
 * action "preview" returns what would happen; "apply" does it; "revert" undoes a
 * previous batch. Preview writes nothing.
 */
export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as {
      action?: string;
      document?: unknown;
      choices?: never;
      batchId?: string;
    };

    if (body.action === "revert") {
      if (!body.batchId) throw new ValidationError({ batchId: ["Required"] });
      return ok(await revertImport(body.batchId));
    }

    const document = parseDocument(body.document);
    const problems = validateAmounts(document);
    if (problems.length) {
      throw new ValidationError({ amounts: problems });
    }

    if (body.action === "apply") {
      return ok(await applyImport(document, body.choices));
    }
    return ok(await buildPlan(document, body.choices));
  } catch (error) {
    return fail(error);
  }
}
