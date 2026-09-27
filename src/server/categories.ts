/** Categories — user-defined groupings for reporting. */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError, isUniqueViolation } from "./errors";

export interface Category {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const categoryInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type CategoryInput = z.input<typeof categoryInput>;

function parse(input: unknown) {
  const result = categoryInput.safeParse(input);
  if (!result.success) {
    throw new ValidationError(z.flattenError(result.error).fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

type Row = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

const toCategory = (row: Row): Category => ({
  id: row.id,
  name: row.name,
  active: row.active,
  sortOrder: row.sortOrder,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function listCategories(
  options: { includeInactive?: boolean } = {},
): Promise<Category[]> {
  const rows = await prisma.category.findMany({
    where: options.includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toCategory);
}

export async function getCategory(id: string): Promise<Category> {
  const row = await prisma.category.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Category");
  return toCategory(row);
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  const data = parse(input);
  try {
    return toCategory(
      await prisma.category.create({
        data: {
          name: data.name,
          active: data.active ?? true,
          sortOrder: data.sortOrder ?? 0,
        },
      }),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError({ name: ["A category with that name already exists"] });
    }
    throw error;
  }
}

export async function updateCategory(id: string, input: CategoryInput): Promise<Category> {
  const data = parse(input);
  await getCategory(id);
  try {
    return toCategory(
      await prisma.category.update({
        where: { id },
        data: {
          name: data.name,
          active: data.active ?? true,
          sortOrder: data.sortOrder ?? 0,
        },
      }),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ValidationError({ name: ["A category with that name already exists"] });
    }
    throw error;
  }
}

/** Deactivates rather than deletes when line items still reference it. */
export async function deleteCategory(id: string): Promise<{ deleted: boolean }> {
  await getCategory(id);
  const inUse = await prisma.lineItem.count({ where: { categoryId: id } });

  if (inUse > 0) {
    await prisma.category.update({ where: { id }, data: { active: false } });
    return { deleted: false };
  }

  await prisma.category.delete({ where: { id } });
  return { deleted: true };
}
