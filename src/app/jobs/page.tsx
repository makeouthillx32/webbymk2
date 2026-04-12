"use client";
import Breadcrumb from "@/components/Common/Breadcrumb";
import SectionTitle from "@/components/Common/SectionTitle";
import JobCard from "@/components/Common/JobCard";
import useJobsData from "@/data/useJobsData";

export default function Jobs() {
  const jobs = useJobsData();

  return (
    <>
      <Breadcrumb pageName={jobs.title} description={jobs.paragraph} />

      <section
        id="jobs"
        className="relative bg-gray-light py-16 dark:bg-bg-color-dark md:py-20 lg:py-28"
      >
        <div className="container">
          <SectionTitle
            title="title"
            paragraph="description"
            width="full"
            center
          />

          <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2 md:gap-x-6 xl:grid-cols-3">
            {jobs.ads.map((ad) => (
              <JobCard key={ad.slug} slug={ad.slug} />
            ))}
          </div>
        </div>

        {/* <AboutSectionOne />
        <AboutSectionTwo /> */}
      </section>
    </>
  );
}
