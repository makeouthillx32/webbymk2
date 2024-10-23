export type Menu = {
  title: string;
  path?: string;
  newTab: boolean;
};

export type Services = {
  title: string;
  paragraph: string;
  image: string;
  tags: string[];
  subServices: subService[];
};

export type subService = {
  title: string;
  description: string;
  images: string[];
  path: string;
  paragraph: string;
  nestedList: bulletList[];
  cta: string;
};

type bulletList = {
  title: string;
  list: string[];
};

export type Jobs = {
  title: string;
  paragraph: string;
  ads: Ad[];
};

type Ad = {
  title: string;
  slug: string;
  image: string;
  description: string;
  paragraph: string;
};

export type Brand = {
  id: number;
  name: string;
  href: string;
  image: string;
  imageLight?: string;
};

export type Feature = {
  id: number;
  icon: JSX.Element;
  title: string;
  paragraph: string;
};
