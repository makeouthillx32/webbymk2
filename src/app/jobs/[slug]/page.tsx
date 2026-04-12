"use client";
import AboutSectionOne from "@/components/About/AboutSectionOne";
import AboutSectionTwo from "@/components/About/AboutSectionTwo";
import Breadcrumb from "@/components/Common/Breadcrumb";
import Gallery from "@/components/Common/Gallery";
import RelatedPost from "@/components/Services/RelatedPost";
import SharePost from "@/components/Services/SharePost";

import TagButton from "@/components/Services/TagButton";
import useJobsData from "@/data/useJobsData";
import { useParams } from "next/navigation";
import { useRouter } from "next/router";

export default function JobPage() {
  const { slug } = useParams();
  const jobs = useJobsData();

  const router = useRouter();
  const job = jobs.ads.find((ad) => ad.slug === slug);

  if (!job) {
    router.push("/error");
    return null;
  }

  return (
    <>
      <Breadcrumb pageName={job.title} description={job.description} />

      {/* <Gallery serviceTitle={title} images={images} /> */}

      <section className="overflow-hidden pb-[120px] ">
        <div className="container">
          <div className="-mx-4 flex flex-wrap">
            <article className="w-full px-4 lg:w-8/12">{job.paragraph}</article>

            <AboutSectionOne />
            <AboutSectionTwo />

            <div className="flex items-center sm:justify-end">
              <SharePost />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
