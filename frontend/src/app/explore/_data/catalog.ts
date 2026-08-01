export const categories = [
  ["All"],
  ["Writing", "Articles", "Essays", "Newsletters"],
  ["Media", "Images", "Music", "Video"],
  ["Software", "APIs", "Code", "Tools"],
  ["Education", "Courses", "Guides", "Workbooks"],
  ["Business", "Research", "Templates", "Reports"],
];

export const sortTabs = ["Trending", "Best Sellers", "Hot & New"];

export const contentTypes = ["All", "Article", "Music", "Image", "Video"];

export type ExploreProduct = {
  id?: string;
  type: string;
  title: string;
  summary?: string;
  creator?: string;
  price: string;
  meta?: string;
  unlocks?: string;
  unlockCount?: number;
  tags?: string[];
  image?: string;
  avatar?: string;
  topCreator?: boolean;
  url?: string;
  views?: number;
  revenue?: number;
  reputationScore?: number | null;
  reputationStars?: number | null;
  ratings?: number;
  createdAt?: string;
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
