import { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const { slug } = params;

  let str = slug.replace(/-/g, " ");
  str = str.charAt(0).toUpperCase() + str.slice(1);

  return {
    title: `${str} | Formen Werkstatt` || "Default Title",
    description: str || "Default Description",
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
