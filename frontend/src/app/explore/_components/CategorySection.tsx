import Link from "next/link";
import { categories } from "../_data/catalog";

export default function CategorySection() {
  return (
    <section className="explore-directory" aria-labelledby="categories-title">
      <h1 id="categories-title">Categories</h1>
      <div className="explore-directory-grid">
        {categories
          .map((categoryGroup) => categoryGroup[0])
          .filter((c: string) => c !== "All")
          .map((category: string) => (
            <Link key={category} href="/explore/products">
              <span>{category}</span>
              <strong>Explore</strong>
            </Link>
          ))}
      </div>
    </section>
  );
}
