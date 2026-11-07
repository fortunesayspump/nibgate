export const categories = [
  ["All"],
  ["Writing", "Articles", "Essays", "Newsletters"],
  ["Media", "Images", "Music", "Video", "Documents"],
  ["Software", "APIs", "Code", "Tools"],
  ["Education", "Courses", "Guides", "Workbooks"],
  ["Business", "Research", "Templates", "Reports"],
];

export const sortTabs = ["Site order", "Trending", "Best Sellers"];

export const contentTypes = ["All", "Article"];

export type ExploreProduct = {
  id?: string;
  type: string;
  title: string;
  summary?: string;
  creator?: string;
  price: string;
  meta?: string;
  unlocks?: string | null;
  unlockCount?: number | null;
  tags?: string[];
  image?: string;
  avatar?: string;
  topCreator?: boolean;
  url?: string;
  views?: number | null;
  revenue?: number | null;
  reputationScore?: number | null;
  reputationStars?: number | null;
  ratings?: number | null;
  createdAt?: string | null;
};

export type Wishlist = {
  title: string;
  copy?: string;
  creator: string;
  products: string;
  followers: string;
  images: string[];
};

export const wishlists: Wishlist[] = [];
