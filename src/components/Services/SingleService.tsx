import { Services } from "@/types";
import { cn } from "@/utils/cn";
import Image from "next/image";
import Link from "next/link";
import { RxGear } from "react-icons/rx";

const SingleService = ({ service }: { service: Services }) => {
  const { title, image, paragraph, tags, subServices } = service;

  return (
    <div className="group relative overflow-hidden rounded-sm bg-white shadow-one duration-300 hover:shadow-two dark:bg-dark dark:hover:shadow-gray-dark">
      {/* Main Content */}
      <div className="relative">
        {/* Image */}
        <div className="relative block h-[75dvh] w-full">
          <Image src={image} alt="image" fill className="object-cover" />

          <div
            className={cn(
              "absolute p-6 sm:p-8 md:px-6 md:py-8 lg:p-8 xl:px-5 xl:py-8 2xl:p-8",
              "bg-gradient-to-r from-slate-950 to-transparent ",
            )}
          >
            <h3
              className={cn(
                "mb-4 block pb-4 text-4xl font-bold text-white lg:text-6xl",
                "border-b border-body-color",
              )}
            >
              {title}
            </h3>
            <p className="mb-6 text-xl font-medium text-white lg:text-2xl">
              {paragraph}
            </p>
          </div>
        </div>
      </div>

      {/* Hover Overlay */}
      <div className="absolute inset-0 z-30 flex items-center justify-center bg-white bg-opacity-60 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div
          className={cn(
            "w-5/6",
            "md:w-4/5 lg:w-3/4",
            subServices.length > 3
              ? "grid grid-cols-2 gap-6"
              : "flex flex-col justify-around gap-4",
          )}
        >
          {subServices.map((subService) => (
            <Link
              key={subService.title}
              href={`/services${subService.path}`}
              className={cn(
                "flex items-center gap-4",
                "text-lg md:text-xl lg:text-2xl",
                "rounded-xl bg-primary px-6 py-4 text-white",
                "transition-transform duration-300 hover:scale-105",
                "w-full", // Ensure items take full width of grid cell
              )}
            >
              <RxGear
                className={cn(
                  "h-12 w-12",
                  "md:h-16 md:w-16",
                  "lg:h-20 lg:w-20",
                )}
              />
              <span className="flex flex-grow items-center">
                {subService.title}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SingleService;
