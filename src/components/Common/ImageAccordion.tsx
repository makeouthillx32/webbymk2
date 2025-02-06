import Image from "next/image";

const items = [
  {
    id: "1",
    url: "/images/testimonials/auth-01.png",
    title: "Unenter",
    description: "Founder",
    tags: ["Floral", "Highlands", "Wildflowers", "Colorful", "Resilience"],
  },

  {
    id: "2",
    url: "/images/testimonials/auth-02.png",
    title: "HelloKittygurlxd",
    description: "Co-Founder",
    tags: ["Twilight", "Peaks", "Silhouette", "Evening Sky", "Peaceful"],
  },
  {
    id: "3",
    url: "/images/testimonials/auth-03.png",
    title: "James",
    description: "Emotinal Support",
    tags: ["Rocky", "Ridges", "Contrast", "Adventure", "Clouds"],
  },
];

export default function ImageAccordion() {
  return (
    <div className="group mx-auto mb-10 mt-3 flex w-[80%] justify-center gap-2 max-md:flex-col">
      {items.map((item, i: number) => {
        return (
          <article
            key={item.id}
            className="group/article relative w-full overflow-hidden rounded-xl transition-all duration-300 ease-[cubic-bezier(.5,.85,.25,1.15)] before:absolute before:inset-x-0 before:bottom-0 before:h-1/3 before:bg-gradient-to-t before:from-black/50 before:transition-opacity after:absolute after:inset-0 after:rounded-lg after:bg-white/30 after:opacity-0 after:backdrop-blur after:transition-all focus-within:ring focus-within:ring-indigo-300 focus-within:before:opacity-100 md:before:opacity-0 md:hover:before:opacity-100 md:group-focus-within:[&:not(:focus-within):not(:hover)]:w-[20%] md:group-focus-within:[&:not(:focus-within):not(:hover)]:after:opacity-100 md:group-hover:[&:not(:hover)]:w-[20%] md:group-hover:[&:not(:hover)]:after:opacity-100"
          >
            <div className="absolute inset-0 z-10 flex  flex-col justify-end p-3 text-white">
              <h1 className=" text-xl font-medium   transition duration-200 ease-[cubic-bezier(.5,.85,.25,1.8)] group-focus-within/article:translate-y-0 group-focus-within/article:opacity-100 group-focus-within/article:delay-300 group-hover/article:translate-y-0 group-hover/article:opacity-100 group-hover/article:delay-300 md:translate-y-2 md:truncate md:whitespace-nowrap md:opacity-0">
                {item?.title}
              </h1>
              <span className=" text-3xl font-medium  transition duration-200 ease-[cubic-bezier(.5,.85,.25,1.8)] group-focus-within/article:translate-y-0 group-focus-within/article:opacity-100 group-focus-within/article:delay-500 group-hover/article:translate-y-0 group-hover/article:opacity-100 group-hover/article:delay-500 md:translate-y-2 md:truncate md:whitespace-nowrap md:opacity-0">
                {item?.description}
              </span>
            </div>
            <Image
              className="h-72 w-full object-cover  md:h-[420px]"
              src={item?.url}
              width="960"
              height="480"
              alt="Image 01"
            />
          </article>
        );
      })}
    </div>
  );
}
