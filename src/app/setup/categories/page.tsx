import { listCategories } from "@/server/categories";
import { PageHeading } from "@/components/ui";
import { CategoryForm, CategoryRow } from "./form";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const categories = await listCategories({ includeInactive: true });

  return (
    <div>
      <PageHeading
        title="Categories"
        description="Groupings used for reporting. These can grow over time — there is no need to get the full set right now."
      />

      <CategoryForm />

      <div className="mt-8 space-y-2">
        {categories.length === 0 ? (
          <p className="text-sm text-muted">Nothing added yet.</p>
        ) : (
          categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))
        )}
      </div>
    </div>
  );
}
