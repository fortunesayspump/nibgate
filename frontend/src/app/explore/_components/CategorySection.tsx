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
            category === "Writing" ? <Link key={category} href="/explore/articles"><span>{category}</span><strong>Explore</strong></Link> : <span key={category} aria-disabled="true"><span>{category}</span><strong>Unavailable</strong></span>
          ))}
      </div>
    </section>
  );
}
