// lib/navTree.ts
// Single source of truth for desktop + mobile navigation

export const navTree = [
  /* =========================
     TOP-LEVEL NAV
     ========================= */

  {
    key: "shop",
    label: "SHOP",
    href: "/shop",
    children: [
      /* ===== Desert Girl Exclusives ===== */
      {
        key: "desert-girl-exclusives",
        label: "DESERT GIRL EXCLUSIVES",
        href: "/shop/desert-girl-exclusives",
        children: [
          {
            key: "dg-graphics-adults",
            label: "Desert Girl Exclusive Graphics – Adults",
            href: "/shop/desert-girl-exclusives/graphics-adults",
          },
          {
            key: "dg-graphics-minis",
            label: "Desert Girl Exclusive Graphics – Minis",
            href: "/shop/desert-girl-exclusives/graphics-minis",
          },
          {
            key: "dg-exclusive-clothing",
            label: "Desert Girl Exclusive Clothing",
            href: "/shop/desert-girl-exclusives/clothing",
          },
        ],
      },

      /* ===== Tops ===== */
      {
        key: "tops",
        label: "TOPS",
        href: "/shop/tops",
        children: [
          { key: "graphics-tees", label: "Graphics Tees", href: "/shop/tops/graphics-tees" },
          {
            key: "dg-graphics-tees",
            label: "Desert Girl Exclusive Graphics Tees",
            href: "/shop/tops/desert-girl-graphics-tees",
          },
          { key: "tops-blouses", label: "Tops & Blouses", href: "/shop/tops/blouses" },
          { key: "tanks-mesh", label: "Tanks & Mesh Tops", href: "/shop/tops/tanks-mesh" },
          {
            key: "outerwear",
            label: "Cardigans, Sweaters & Outerwear",
            href: "/shop/tops/outerwear",
          },
        ],
      },

      /* ===== Bottoms & Sets ===== */
      {
        key: "bottoms-sets",
        label: "BOTTOMS & SETS",
        href: "/shop/bottoms-sets",
        children: [
          { key: "denim-pants", label: "Denim & Pants", href: "/shop/bottoms-sets/denim-pants" },
          {
            key: "dresses-skirts-rompers",
            label: "Dresses, Skirts & Rompers",
            href: "/shop/bottoms-sets/dresses-skirts-rompers",
          },
          { key: "shorts", label: "Shorts", href: "/shop/bottoms-sets/shorts" },
          {
            key: "active-lounge",
            label: "Activewear, Lounge Sets & Pajamas",
            href: "/shop/bottoms-sets/active-lounge",
          },
        ],
      },

      /* ===== Jewelry & Accessories ===== */
      {
        key: "jewelry-accessories",
        label: "JEWELRY & ACCESSORIES",
        href: "/shop/jewelry-accessories",
        children: [
          { key: "authentic-jewelry", label: "Authentic Jewelry", href: "/shop/jewelry-accessories/authentic" },
          {
            key: "necklaces-earrings-bracelets",
            label: "Necklaces, Earrings & Bracelets",
            href: "/shop/jewelry-accessories/necklaces-earrings-bracelets",
          },
          {
            key: "bracelets-watchbands",
            label: "Bracelets & Watchbands",
            href: "/shop/jewelry-accessories/bracelets-watchbands",
          },
          { key: "bags", label: "Purses, Bags & Clutches", href: "/shop/jewelry-accessories/bags" },
          { key: "backpacks", label: "Backpacks", href: "/shop/jewelry-accessories/backpacks" },
          { key: "headwear", label: "Lids & Headwear", href: "/shop/jewelry-accessories/headwear" },
          { key: "trucker-caps", label: "Trucker Caps", href: "/shop/jewelry-accessories/trucker-caps" },
          { key: "belts", label: "Belts", href: "/shop/jewelry-accessories/belts" },
          { key: "belt-buckles", label: "Belt Buckles", href: "/shop/jewelry-accessories/belt-buckles" },
          {
            key: "scarves",
            label: "Wild Rags, Twillys & Scarves",
            href: "/shop/jewelry-accessories/scarves",
          },
        ],
      },

      /* ===== The Extras ===== */
      {
        key: "extras",
        label: "THE EXTRAS",
        href: "/shop/extras",
        children: [
          { key: "bralettes-bodysuits", label: "Bralettes & Bodysuits", href: "/shop/extras/bralettes-bodysuits" },
          { key: "western-swim", label: "Western Swim", href: "/shop/extras/western-swim" },
          { key: "footwear", label: "Footwear", href: "/shop/extras/footwear" },
          { key: "drinkware", label: "Drinkware", href: "/shop/extras/drinkware" },
          { key: "home-decor", label: "Home Decor", href: "/shop/extras/home-decor" },
          {
            key: "roping-supplies",
            label: "Smarty & Heel-O-Matic – Roping Supplies",
            href: "/shop/extras/roping-supplies",
          },
        ],
      },

      /* ===== Deals & Sales ===== */
      {
        key: "deals-sales",
        label: "DESERT GIRL DEALS / SALES",
        href: "/shop/deals",
        children: [
          { key: "mystery-bags", label: "Mystery Grab Bags", href: "/shop/deals/mystery-bags" },
          { key: "deals-women", label: "Desert Girl Deals – Women", href: "/shop/deals/women" },
          { key: "deals-cowkids", label: "Desert Girl Deals – Cowkids", href: "/shop/deals/cowkids" },
          { key: "deals-footwear", label: "Desert Girl Deals – Footwear", href: "/shop/deals/footwear" },
          { key: "sample-sale", label: "Graphic Sample Sale – Price As Marked", href: "/shop/deals/sample-sale" },
          { key: "holiday-sale", label: "Holiday Sale – Auto Code", href: "/shop/deals/holiday-sale" },
          { key: "final-sale", label: "Sweater Edit – Final Sale", href: "/shop/deals/final-sale" },
        ],
      },
    ],
  },

  /* =========================
     OTHER TOP-LEVEL PAGES
     ========================= */

  { key: "new-releases", label: "NEW RELEASES", href: "/new-releases" },
  { key: "restocks", label: "RESTOCKS", href: "/restocks" },

  {
    key: "cowkids",
    label: "COWKIDS",
    href: "/cowkids",
    children: [
      { key: "kids-graphics", label: "Kids Exclusive Western Graphics", href: "/cowkids/graphics" },
      { key: "mini-darlins", label: "Mini Darlins’", href: "/cowkids/mini-darlins" },
      { key: "mini-buckarros", label: "Mini Buckarros", href: "/cowkids/mini-buckarros" },
      { key: "kids-swim", label: "Minis Western Swim", href: "/cowkids/swim" },
      { key: "kids-home", label: "Kids Home & Accessories", href: "/cowkids/home-accessories" },
    ],
  },

  { key: "cowboy-valentine", label: "COWBOY VALENTINE", href: "/cowboy-valentine" },

  {
    key: "shop-occasions",
    label: "SHOP OCCASIONS",
    href: "/occasions",
    children: [
      { key: "galentine", label: "Howdy Galentine – Lounge Edit", href: "/occasions/galentine" },
      { key: "date-night", label: "Date Night – Darling Edit", href: "/occasions/date-night" },
      { key: "denim-edit", label: "Blue Jean Darling – Denim Edit", href: "/occasions/denim" },
      { key: "spring-transition", label: "Spring Transition", href: "/occasions/spring" },
      { key: "valentine", label: "Cowboy Valentine", href: "/occasions/valentine" },
      { key: "st-patricks", label: "Luck of the Cowboy – St. Patrick’s", href: "/occasions/st-patricks" },
    ],
  },

  { key: "gift-card", label: "GIFT CARD", href: "/gift-card" },
  { key: "best-sellers", label: "BEST SELLERS", href: "/best-sellers" },

  /* Currency selector handled separately in UI */
] as const;