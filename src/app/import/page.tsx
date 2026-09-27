import Link from "next/link";
import { listImportBatches } from "@/server/import";
import { versionLabel } from "@/lib/version";
import { PageHeading } from "@/components/ui";
import { Importer } from "./importer";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const batches = await listImportBatches();

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <Link href="/" className="text-sm text-muted hover:text-foreground">
        Budget
      </Link>

      <div className="mt-4">
        <PageHeading
          title="Import"
          description="Load a year from a converted workbook. Nothing is written until you have reviewed what it will do."
        />
      </div>

      <Importer batches={batches} />

      <footer className="mt-12 text-xs text-muted">{versionLabel()}</footer>
    </div>
  );
}
