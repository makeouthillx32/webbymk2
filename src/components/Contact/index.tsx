import ContactCard from "./ContactCard";
import dynamic from "next/dynamic";

const Map = dynamic(() => import("./Map"), { ssr: false });

import { getScopedI18n } from "@/locales/server";
import { cn } from "@/utils/cn";

export default async function Contact() {
  const t = await getScopedI18n("contact");

  return (
    <section id="contact" className="overflow-hidden py-16 md:pb-20 lg:pb-24">
      <div className="container">
        <div
          className={cn(
            "-mx-4 flex flex-wrap",
            "lg:grid lg:grid-cols-12 lg:grid-rows-2",
          )}
        >
          <div className={cn("col-span-5 row-span-2 w-full px-4 pb-4")}>
            <ContactCard />
          </div>

          <div className={cn("col-span-7 w-full px-4 pb-4 ")}>
            <Map center={[49.707556892870045, 8.84701398118458]} zoom={16} />
          </div>

          <div className={cn("col-span-7 h-full w-full px-4 pb-4 ")}>
            <div
              className={cn(
                " rounded-sm bg-white px-8 py-11 shadow-two dark:bg-gray-dark ",
                // " sm:p-[55px] lg:mb-5 lg:px-8 xl:p-[55px]",
              )}
              data-wow-delay=".15s
              "
            >
              <h3 className="mb-3 text-2xl font-bold text-black dark:text-white sm:text-3xl lg:text-2xl xl:text-3xl">
                {t("form.title")}
              </h3>
              <p className="mb-12 text-base font-medium text-body-color">
                {t("form.paragraph")}
              </p>
              <form>
                <div className="-mx-4 flex flex-wrap">
                  <div className="w-full px-4 md:w-1/2">
                    <div className="mb-6">
                      <label
                        htmlFor="name"
                        className="block text-sm font-medium text-dark dark:text-white"
                      >
                        Name
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        placeholder="Name"
                        className="border-stroke w-full rounded-sm border bg-[#f8f8f8] px-4 py-3 text-base text-body-color outline-none focus:border-primary dark:border-transparent dark:bg-[#2C303B] dark:text-body-color-dark dark:focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="w-full px-4 md:w-1/2">
                    <div className="mb-6">
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium text-dark dark:text-white"
                      >
                        Email
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="Email"
                        className="border-stroke w-full rounded-sm border bg-[#f8f8f8] px-4 py-3 text-base text-body-color outline-none focus:border-primary dark:border-transparent dark:bg-[#2C303B] dark:text-body-color-dark dark:focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="w-full px-4">
                    <div className="mb-6">
                      <label
                        htmlFor="message"
                        className="block text-sm font-medium text-dark dark:text-white"
                      >
                        Message
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        rows={5}
                        placeholder={t("form.textarea")}
                        className="border-stroke w-full resize-none rounded-sm border bg-[#f8f8f8] px-4 py-3 text-base text-body-color outline-none focus:border-primary dark:border-transparent dark:bg-[#2C303B] dark:text-body-color-dark dark:focus:border-primary"
                      ></textarea>
                    </div>
                  </div>
                  <div className="w-full px-4">
                    <button
                      type="submit"
                      className="rounded-sm bg-primary px-6 py-3 text-base font-medium text-white shadow-submit duration-300 hover:bg-primary/90 dark:shadow-submit-dark"
                    >
                      {t("form.submit")}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
