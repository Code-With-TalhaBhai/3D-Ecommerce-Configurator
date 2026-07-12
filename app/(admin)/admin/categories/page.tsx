import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { OTHERS_CATEGORY_SLUG } from "@/lib/categories";
import { CategoryForm } from "./category-form";
import { deleteCategory } from "./actions";

export const metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Categories
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Vendors pick a category when uploading a product, and customers filter
          the marketplace by it. Deleting a category moves its products to
          &ldquo;Others&rdquo;.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Add a category
        </h2>
        <CategoryForm />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          All categories ({categories.length})
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3 text-right">Products</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {categories.map((c) => {
                const isDefault = c.slug === OTHERS_CATEGORY_SLUG;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      {c.name}
                      {isDefault && (
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          Default
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {c.slug}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {c._count.products}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        {!isDefault && (
                          <form action={deleteCategory}>
                            <input type="hidden" name="id" value={c.id} />
                            <Button type="submit" variant="destructive" size="sm">
                              Delete
                            </Button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
