export const categories = [
  ["All"],
  ["Writing", "Articles", "Essays", "Newsletters"],
  ["Media", "Images", "Music", "Video"],
  ["Software", "APIs", "Code", "Tools"],
  ["Education", "Courses", "Guides", "Workbooks"],
  ["Business", "Research", "Templates", "Reports"],
];

export const sortTabs = ["Trending", "Best Sellers", "Hot & New"];

export const contentTypes = ["Articles", "Music", "Images", "Video"];

export type ExploreProduct = {
  type: string;
  title: string;
  summary?: string;
  creator?: string;
  price: string;
  meta?: string;
  unlocks?: string;
  image?: string;
  avatar?: string;
  topCreator?: boolean;
};

export type Wishlist = {
  title: string;
  copy?: string;
  creator: string;
  products: string;
  followers: string;
  images: string[];
};

export const featuredProducts: ExploreProduct[] = [];

export const marketProducts: ExploreProduct[] = [];

export const wishlists: Wishlist[] = [];
