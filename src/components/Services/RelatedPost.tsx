import { cn } from "@/utils/cn";
import Image from "next/image";
import Link from "next/link";

const RelatedPost = ({
  image,
  path,
  title,
  description,
}: {
  image: string;
  path: string;
  title: string;
  description: string;
}) => {
  return (
    <Link
      href={path}
      className={cn(
        "flex items-center rounded-lg p-4  lg:block xl:flex",
        "border-2 border-transparent transition duration-300 hover:border-primary/70 hover:bg-primary/10 hover:shadow-lg ",
      )}
    >
      <div className="mr-5 lg:mb-3 xl:mb-0">
        <div className="relative h-[60px] w-[70px] overflow-hidden rounded-md sm:h-[75px] sm:w-[85px]">
          <Image src={image} alt={title} fill />
        </div>
      </div>
      <div className="w-full">
        <h5 className="mb-[6px] block text-base font-medium leading-snug text-black dark:text-white">
          {title}
        </h5>
        <p className="text-xs font-medium text-body-color">{description}</p>
      </div>
    </Link>
  );
};

export default RelatedPost;
