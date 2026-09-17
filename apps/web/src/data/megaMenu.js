/**
 * Mega-menu taxonomy for the public /buy surface.
 *
 * Editorial navigation data only — no backend coupling, no fake
 * destinations. Every leaf resolves through `resolveMenuTarget` in
 * HomePage to exactly one of:
 *   - { kind: "category", name } → live backend category match
 *     (falls back to a title+description search when the catalogue
 *     has no such category yet),
 *   - { kind: "search", q }      → existing GET /catalog/listings?q=,
 *   - { kind: "route", hash }    → an existing in-app route
 *     (used only by the Admin List menu, which lands on the
 *     ADMIN-gated admin app — backend-enforced, never public).
 */

export const MEGA_NAV = [
  { id: "home", label: "Home", kind: "home" },
  { id: "furniture", label: "Furniture", kind: "menu" },
  { id: "mobiles", label: "Mobiles", kind: "menu" },
  { id: "kitchen", label: "Kitchen", kind: "menu" },
  { id: "electronics", label: "Electronics", kind: "menu" },
  { id: "clothing", label: "Clothing", kind: "menu" },
  { id: "gaming", label: "Gaming", kind: "menu" },
  { id: "books", label: "Books", kind: "menu" },
  { id: "auctions", label: "Auctions", kind: "auctions" },
  { id: "admin", label: "Admin List", kind: "menu" },
];

export const MEGA_MENUS = {
  furniture: {
    title: "Furniture",
    tagline: "Rooms, pieces and storage for every corner.",
    sections: [
      {
        heading: "Living Room",
        links: [
          { label: "Sofas", target: { kind: "search", q: "sofa" } },
          { label: "Coffee Tables", target: { kind: "search", q: "coffee table" } },
          { label: "TV Units", target: { kind: "search", q: "tv unit" } },
          { label: "Shoe Racks", target: { kind: "search", q: "shoe rack" } },
        ],
      },
      {
        heading: "Bedroom",
        links: [
          { label: "Beds", target: { kind: "search", q: "bed" } },
          { label: "Wardrobes", target: { kind: "search", q: "wardrobe" } },
          { label: "Dressers", target: { kind: "search", q: "dresser" } },
          { label: "Mattresses", target: { kind: "search", q: "mattress" } },
        ],
      },
      {
        heading: "Dining Room",
        links: [
          { label: "Dining Tables", target: { kind: "search", q: "dining table" } },
          { label: "Chairs", target: { kind: "search", q: "chair" } },
          { label: "Cabinets", target: { kind: "search", q: "cabinet" } },
        ],
      },
      {
        heading: "Office",
        links: [
          { label: "Office Chairs", target: { kind: "search", q: "office chair" } },
          { label: "Study Tables", target: { kind: "search", q: "study table" } },
          { label: "Bookshelves", target: { kind: "search", q: "bookshelf" } },
        ],
      },
      {
        heading: "Outdoor",
        links: [
          { label: "Garden Chairs", target: { kind: "search", q: "garden chair" } },
          { label: "Swings", target: { kind: "search", q: "swing" } },
        ],
      },
    ],
    explore: { kind: "category", name: "Furniture" },
  },
  mobiles: {
    title: "Mobiles",
    tagline: "Phones, refurbished picks and everyday accessories.",
    sections: [
      {
        heading: "By Brand",
        links: [
          { label: "Apple", target: { kind: "search", q: "apple" } },
          { label: "Samsung", target: { kind: "search", q: "samsung" } },
          { label: "OnePlus", target: { kind: "search", q: "oneplus" } },
          { label: "Xiaomi", target: { kind: "search", q: "xiaomi" } },
          { label: "Realme", target: { kind: "search", q: "realme" } },
        ],
      },
      {
        heading: "By Type",
        links: [
          { label: "Smartphones", target: { kind: "search", q: "smartphone" } },
          { label: "Feature Phones", target: { kind: "search", q: "feature phone" } },
          { label: "Refurbished", target: { kind: "search", q: "refurbished" } },
        ],
      },
      {
        heading: "Accessories",
        links: [
          { label: "Chargers", target: { kind: "search", q: "charger" } },
          { label: "Covers", target: { kind: "search", q: "cover" } },
          { label: "Power Banks", target: { kind: "search", q: "power bank" } },
        ],
      },
    ],
    explore: { kind: "category", name: "Mobiles" },
  },
  kitchen: {
    title: "Kitchen",
    tagline: "Cookware, appliances and storage that work hard.",
    sections: [
      {
        heading: "Cookware",
        links: [
          { label: "Pans", target: { kind: "search", q: "pan" } },
          { label: "Pots", target: { kind: "search", q: "pot" } },
          { label: "Pressure Cookers", target: { kind: "search", q: "pressure cooker" } },
        ],
      },
      {
        heading: "Appliances",
        links: [
          { label: "Mixer Grinder", target: { kind: "search", q: "mixer" } },
          { label: "Microwave", target: { kind: "search", q: "microwave" } },
          { label: "Juicer", target: { kind: "search", q: "juicer" } },
          { label: "Refrigerator", target: { kind: "search", q: "refrigerator" } },
        ],
      },
      {
        heading: "Storage",
        links: [
          { label: "Containers", target: { kind: "search", q: "container" } },
          { label: "Racks", target: { kind: "search", q: "rack" } },
          { label: "Jars", target: { kind: "search", q: "jar" } },
        ],
      },
      {
        heading: "Dining",
        links: [
          { label: "Dinner Sets", target: { kind: "search", q: "dinner set" } },
          { label: "Water Bottles", target: { kind: "search", q: "bottle" } },
        ],
      },
    ],
    explore: { kind: "category", name: "Kitchen" },
  },
  clothing: {
    title: "Clothing",
    tagline: "Everyday wear and seasonal staples.",
    sections: [
      {
        heading: "Men",
        links: [
          { label: "Shirts", target: { kind: "search", q: "shirt" } },
          { label: "Jeans", target: { kind: "search", q: "jeans" } },
          { label: "Jackets", target: { kind: "search", q: "jacket" } },
        ],
      },
      {
        heading: "Women",
        links: [
          { label: "Dresses", target: { kind: "search", q: "dress" } },
          { label: "Kurtas", target: { kind: "search", q: "kurta" } },
          { label: "Sarees", target: { kind: "search", q: "saree" } },
        ],
      },
      {
        heading: "Footwear",
        links: [
          { label: "Sneakers", target: { kind: "search", q: "sneakers" } },
          { label: "Sandals", target: { kind: "search", q: "sandals" } },
        ],
      },
    ],
    explore: { kind: "category", name: "Clothing" },
  },
  electronics: {
    title: "Electronics",
    tagline: "Home appliances, computing and cameras.",
    sections: [
      {
        heading: "Home Appliances",
        links: [
          { label: "Refrigerators", target: { kind: "search", q: "refrigerator" } },
          { label: "Washing Machines", target: { kind: "search", q: "washing machine" } },
          { label: "Microwaves", target: { kind: "search", q: "microwave" } },
          { label: "Air Conditioners", target: { kind: "search", q: "air conditioner" } },
        ],
      },
      {
        heading: "Computing",
        links: [
          { label: "Laptops", target: { kind: "search", q: "laptop" } },
          { label: "Monitors", target: { kind: "search", q: "monitor" } },
          { label: "Keyboards", target: { kind: "search", q: "keyboard" } },
        ],
      },
      {
        heading: "Cameras",
        links: [
          { label: "DSLR", target: { kind: "search", q: "dslr" } },
          { label: "Mirrorless", target: { kind: "search", q: "mirrorless" } },
          { label: "Lenses", target: { kind: "search", q: "lens" } },
        ],
      },
    ],
    explore: { kind: "category", name: "Electronics" },
  },
  gaming: {
    title: "Gaming",
    tagline: "Consoles, titles and battle stations.",
    sections: [
      {
        heading: "Consoles",
        links: [
          { label: "PlayStation", target: { kind: "search", q: "playstation" } },
          { label: "Xbox", target: { kind: "search", q: "xbox" } },
          { label: "Nintendo", target: { kind: "search", q: "nintendo" } },
        ],
      },
      {
        heading: "Games",
        links: [
          { label: "Action", target: { kind: "search", q: "game" } },
          { label: "Sports", target: { kind: "search", q: "sports game" } },
        ],
      },
      {
        heading: "Accessories",
        links: [
          { label: "Controllers", target: { kind: "search", q: "controller" } },
          { label: "Headsets", target: { kind: "search", q: "headset" } },
          { label: "Gaming Chairs", target: { kind: "search", q: "gaming chair" } },
        ],
      },
    ],
    explore: { kind: "category", name: "Gaming" },
  },
  books: {
    title: "Books",
    tagline: "Fiction, learning and everything in between.",
    sections: [
      {
        heading: "Fiction",
        links: [
          { label: "Novels", target: { kind: "search", q: "novel" } },
          { label: "Comics", target: { kind: "search", q: "comics" } },
        ],
      },
      {
        heading: "Learning",
        links: [
          { label: "Textbooks", target: { kind: "search", q: "textbook" } },
          { label: "Exam Prep", target: { kind: "search", q: "exam" } },
        ],
      },
      {
        heading: "Kids",
        links: [
          { label: "Picture Books", target: { kind: "search", q: "picture book" } },
          { label: "Activity Books", target: { kind: "search", q: "activity book" } },
        ],
      },
    ],
    explore: { kind: "category", name: "Books" },
  },
  collectibles: {
    title: "Collectibles",
    tagline: "Rare finds, vintage pieces and timeless objects.",
    sections: [
      {
        heading: "Collectible",
        links: [
          { label: "Coins", target: { kind: "search", q: "coin" } },
          { label: "Stamps", target: { kind: "search", q: "stamp" } },
          { label: "Banknotes", target: { kind: "search", q: "banknote" } },
        ],
      },
      {
        heading: "Vintage",
        links: [
          { label: "Vintage Decor", target: { kind: "search", q: "vintage" } },
          { label: "Antiques", target: { kind: "search", q: "antique" } },
          { label: "Retro Phones", target: { kind: "search", q: "retro phone" } },
        ],
      },
      {
        heading: "Hobby",
        links: [
          { label: "Model Kits", target: { kind: "search", q: "model kit" } },
          { label: "Trading Cards", target: { kind: "search", q: "trading cards" } },
        ],
      },
    ],
    explore: { kind: "search", q: "collectible" },
  },
  sports: {
    title: "Sports",
    tagline: "Gear for training, outdoors and game day.",
    sections: [
      {
        heading: "Fitness",
        links: [
          { label: "Dumbbells", target: { kind: "search", q: "dumbbell" } },
          { label: "Yoga Mats", target: { kind: "search", q: "yoga mat" } },
          { label: "Cycles", target: { kind: "search", q: "cycle" } },
        ],
      },
      {
        heading: "Outdoor",
        links: [
          { label: "Camping Tents", target: { kind: "search", q: "camping tent" } },
          { label: "Backpacks", target: { kind: "search", q: "backpack" } },
        ],
      },
      {
        heading: "Team Sports",
        links: [
          { label: "Cricket Bats", target: { kind: "search", q: "cricket bat" } },
          { label: "Footballs", target: { kind: "search", q: "football" } },
        ],
      },
    ],
    explore: { kind: "search", q: "sports" },
  },
  toys: {
    title: "Toys",
    tagline: "Playtime for every age.",
    sections: [
      {
        heading: "Play",
        links: [
          { label: "Action Figures", target: { kind: "search", q: "action figure" } },
          { label: "Dolls", target: { kind: "search", q: "doll" } },
          { label: "Remote Cars", target: { kind: "search", q: "remote car" } },
        ],
      },
      {
        heading: "Learn",
        links: [
          { label: "Board Games", target: { kind: "search", q: "board game" } },
          { label: "Puzzles", target: { kind: "search", q: "puzzle" } },
          { label: "Building Sets", target: { kind: "search", q: "building set" } },
        ],
      },
    ],
    explore: { kind: "search", q: "toys" },
  },
  automotive: {
    title: "Automotive",
    tagline: "Vehicles, parts and road-ready accessories.",
    sections: [
      {
        heading: "Vehicles",
        links: [
          { label: "Cars", target: { kind: "search", q: "car" } },
          { label: "Bikes", target: { kind: "search", q: "bike" } },
          { label: "Scooters", target: { kind: "search", q: "scooter" } },
        ],
      },
      {
        heading: "Parts",
        links: [
          { label: "Tyres", target: { kind: "search", q: "tyre" } },
          { label: "Batteries", target: { kind: "search", q: "battery" } },
          { label: "Helmets", target: { kind: "search", q: "helmet" } },
        ],
      },
    ],
    explore: { kind: "search", q: "automotive" },
  },
  admin: {
    title: "Admin List",
    tagline: "Platform controls. ADMIN role required — enforced by the backend.",
    admin: true,
    sections: [
      {
        heading: "User Management",
        links: [
          { label: "All Users", target: { kind: "route", hash: "#/admin/users" } },
          { label: "Dashboard", target: { kind: "route", hash: "#/admin" } },
        ],
      },
      {
        heading: "Product Management",
        links: [
          { label: "All Products", target: { kind: "route", hash: "#/admin/listings" } },
          { label: "Pending Approval", target: { kind: "route", hash: "#/admin/moderation" } },
          { label: "Reported Items", target: { kind: "route", hash: "#/admin/reports" } },
        ],
      },
      {
        heading: "Orders",
        links: [
          { label: "All Orders", target: { kind: "route", hash: "#/admin/orders" } },
          { label: "Payments", target: { kind: "route", hash: "#/admin/payments" } },
          { label: "Auctions", target: { kind: "route", hash: "#/admin/auctions" } },
        ],
      },
      {
        heading: "Platform",
        links: [
          { label: "Reviews", target: { kind: "route", hash: "#/admin/reviews" } },
          { label: "Support Tickets", target: { kind: "route", hash: "#/admin/support" } },
        ],
      },
    ],
    explore: { kind: "route", hash: "#/admin" },
  },
};
