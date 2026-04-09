// Force all checkout pages to be dynamically rendered.
// They depend on cart context and user session — never statically prerenderable.
export const dynamic = "force-dynamic";

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
