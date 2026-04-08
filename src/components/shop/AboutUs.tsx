"use client";

import Image from "next/image";

interface AboutUsPageProps {
  navigateTo: (page: string) => void;
}

export default function AboutUsPage({ navigateTo }: AboutUsPageProps) {
  return (
    <div className="space-y-8 text-[var(--foreground)] bg-[var(--background)]">
      <div className="text-sm space-y-4">
        <p className="text-lg font-medium">Serving the community since 1961</p>
        <p>
          DART, a private, not-for-profit corporation, was founded in 1961. We are a provider of
          services for Regional Centers, Department of Rehabilitation, and Sierra Sands Unified School District.
        </p>
        <p>
          DART is accredited by CARF, which stands as a symbol of our commitment to the highest quality of services.
        </p>
        <p>
          Desert Area Resources and Training has received a three-year accreditation from CARF, the
          Rehabilitation Accreditation Commission. A copy of the accreditation survey is available
          upon request from the main DART office. For more information about CARF go to{" "}
          <a href="https://www.carf.org" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
            www.carf.org
          </a>.
        </p>
        <div className="border-l-4 border-gray-400 pl-4 space-y-2 mt-6">
          <p className="font-semibold">We Believe…</p>
          <p>
            IN the right of persons with disabilities to accessibility and integration in society.
          </p>
          <p>
            IN providing quality training to enhance the achievement of individual skills and
            development of dignity and self worth.
          </p>
          <p>
            IN an obligation of excellence by providing integrated community events, public awareness
            and a structured support and advocacy system and by fulfilling client needs for vocational,
            supported living and recreational skills.
          </p>
          <p>
            WE will be a success when we have achieved community awareness and integration in society.
          </p>
        </div>
      </div>
    </div>
  );
}
