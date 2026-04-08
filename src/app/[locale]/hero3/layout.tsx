import { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  let str = id.replace(/-/g, " ");
  str = str.charAt(0).toUpperCase() + str.slice(1);

  return {
    title: `Services | Formen Werkstatt`,
    description: str,
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
