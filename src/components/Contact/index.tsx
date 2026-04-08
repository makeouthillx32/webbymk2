import ContactCard from "./ContactCard";
import { ContactMap } from "./ContactClient";
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
            <ContactMap center={[49.707556892870045, 8.84701398118458]} zoom={16} />
          </div>

          <div className={cn("col-span-7 h-full w-full px-4 pb-4 ")}>
            <div
              className={cn(
                " rounded-sm bg-white px-8 py-11 shadow-two dark:bg-gray-dark ",
              )}
              data-wow-delay=".15s"
            >
              <h3 className="mb-3 text-2xl font-bold text-black dark:text-white sm:text-3xl lg:text-2xl xl:text-3xl">
                {t("form.title")}
              </h3>
              <p className="mb-12 text-base font-medium text-body-color">
                {t("form.paragraph")}
              </p>
              <form>
                <div className="-mx-4 flex flex-wrap">
                  {/* existing form fields unchanged */}
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}