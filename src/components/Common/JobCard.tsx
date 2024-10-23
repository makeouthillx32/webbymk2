import Image from "next/image";
import Link from "next/link";

export default function JobCard({
  title = "Initiative Bewerbung",
  description = "Wir helfen dir gerne, die beste Loesung zu finden.",
  slug,
}: {
  title?: string;
  description?: string;
  slug: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-sm bg-white shadow-two duration-300 hover:shadow-three dark:bg-dark dark:hover:shadow-gray-dark">
      {/* Main Content */}
      <div className="relative">
        {/* Image */}
        <div className="relative block aspect-[5/4] w-full">
          <Image
            src={"/images/testimonials/auth-01.png"}
            alt="image"
            fill
            className="object-cover"
          />
        </div>

        {/* Text Content */}
        <div className="p-6 sm:p-8 md:px-6 md:py-8 lg:p-8 xl:px-5 xl:py-8 2xl:p-8">
          <h3 className="mb-4 block text-xl font-bold text-black dark:text-white sm:text-2xl">
            {title}
          </h3>
          <p className="mb-6 border-b border-body-color border-opacity-10 pb-6 text-base font-medium text-body-color dark:border-white dark:border-opacity-10">
            {description}
          </p>
        </div>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-white bg-opacity-70 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <Link
          href={`/${slug}`}
          className="inline-block rounded-full bg-primary px-8 py-4 text-xl text-white transition-transform duration-300 hover:scale-105"
        >
          Jetzt Bewerben
        </Link>
      </div>
    </div>
  );
}
