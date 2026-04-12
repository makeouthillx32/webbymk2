"use client";
import Breadcrumb from "@/components/Common/Breadcrumb";
import Gallery from "@/components/Common/Gallery";
import RelatedPost from "@/components/Services/RelatedPost";
import SharePost from "@/components/Services/SharePost";
import SubserviceContent from "@/components/Services/SubserviceContent";
import TagButton from "@/components/Services/TagButton";
import useServicesData from "@/data/useServiceData";
import { subService } from "@/types";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ServicePage() {
  const { id } = useParams();
  const router = useRouter();
  const serviceData = useServicesData();

  const [relatedPosts, setRelatedPosts] = useState<subService[]>([]);

  const subserviceList = serviceData.flatMap((service) => service.subServices);
  const subservice = subserviceList.find(
    (subservice) => subservice.path === `/${id}`,
  );

  useEffect(() => {
    const shuffledPosts = subserviceList
      .filter((service) => service.path !== `/${id}`)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);

    setRelatedPosts(shuffledPosts);
  }, []);

  if (!subservice) {
    router.push("/error");
    return null;
  }

  const { title, description, images } = subservice;

  return (
    <>
      <Breadcrumb pageName={title} description={description} />

      <Gallery serviceTitle={title} images={images} />

      <section className="overflow-hidden pb-[120px] ">
        <div className="container">
          <div className="-mx-4 flex flex-wrap">
            <div className="w-full px-4 lg:w-8/12">
              <SubserviceContent subservice={subservice} />
            </div>
            <div className="w-full px-4 lg:w-4/12">
              <div className="mb-10 rounded-lg bg-white shadow-three dark:bg-gray-dark dark:shadow-none">
                <h3 className="border-b border-body-color border-opacity-10 px-8 py-4 text-lg font-semibold text-black dark:border-white dark:border-opacity-10 dark:text-white">
                  Related Posts
                </h3>
                <ul className="p-4">
                  {relatedPosts.map((service, index) => (
                    <li key={service.title + index}>
                      <RelatedPost
                        title={service.title}
                        image="/images/blog/post-01.jpg"
                        path={`/services/${service.path}`}
                        description={service.description}
                      />
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center sm:justify-end">
                <SharePost />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
