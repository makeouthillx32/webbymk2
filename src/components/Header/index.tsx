"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef, RefObject } from "react";
import ThemeToggler from "./ThemeToggler";
import { useChangeLocale, useCurrentLocale } from "@/locales/client";
import useMenuData from "@/data/useMenuData";
import useServiceData from "@/data/useServiceData";
import { cn } from "@/utils/cn";
import { useTheme } from "next-themes";  // Move the import here

const Header = () => {
  const { theme } = useTheme();  // Access the current theme here
  const menuData = useMenuData();
  const serviceData = useServiceData();
  
  const locale = useCurrentLocale();
  const pathname = usePathname();
  const changeLocale = useChangeLocale();

  const [navbarOpen, setNavbarOpen] = useState(false);
  const [sticky, setSticky] = useState(false);
  const [openIndex, setOpenIndex] = useState(1);
  const navbarRef: RefObject<HTMLDivElement> = useRef(null);

  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const handleStickyNavbar = () => {
    if (window.scrollY >= 80) {
      setSticky(true);
    } else {
      setSticky(false);
    }
  };

  const handleResize = () => {
    setIsSmallScreen(window.innerWidth < 1024);
    if (window.innerWidth >= 1024) {
      setNavbarOpen(false);
    }
  };

  useEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleStickyNavbar);

    return () => {
      window.removeEventListener("scroll", handleStickyNavbar);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handleSubmenu = (index: number) => {
    if (openIndex === index) {
      setOpenIndex(-1);
    } else {
      setOpenIndex(index);
    }
  };

  return (
    <header
      className={`header left-0 top-0 z-40 flex w-full items-center ${
        sticky
          ? "fixed z-[9999] bg-white !bg-opacity-80 shadow-sticky backdrop-blur-sm transition dark:bg-gray-dark dark:shadow-sticky-dark"
          : "absolute bg-transparent"
      }`}
    >
      <div className="container">
        <div className="relative -mx-4 flex items-center justify-between">
          <div className="w-60 max-w-full px-4 xl:mr-12">
            <Link
              onClick={() => setNavbarOpen(false)}
              href="/"
              className={`header-logo block w-full ${
                sticky ? "py-5 lg:py-2" : "py-8"
              }`}
            >
              {/* Conditionally render the logo based on theme */}
              <Image 
                src={theme === "dark" ? "/logodk.svg" : "/logo.svg"}  // Logo switch based on theme
                alt="logo" 
                width={150} 
                height={100} 
              />
            </Link>
          </div>
          <div className="flex w-full items-center justify-between px-4">
            <div>
              <button
                onClick={() => {
                  setNavbarOpen(!navbarOpen);
                }}
                id="navbarToggler"
                aria-label="Mobile Menu"
                className="absolute right-4 top-1/2 z-50 block translate-y-[-50%] rounded-lg px-3 py-[6px] ring-primary focus:ring-2 lg:hidden"
              >
                <span
                  className={`relative my-1.5 block h-0.5 w-[30px] bg-black transition-all duration-300 dark:bg-white ${
                    navbarOpen ? " top-[7px] rotate-45" : ""
                  }`}
                />
                <span
                  className={`relative my-1.5 block h-0.5 w-[30px] bg-black transition-all duration-300 dark:bg-white ${
                    navbarOpen ? "opacity-0" : ""
                  }`}
                />
                <span
                  className={`relative my-1.5 block h-0.5 w-[30px] bg-black transition-all duration-300 dark:bg-white ${
                    navbarOpen ? " top-[-8px] -rotate-45" : ""
                  }`}
                />
              </button>
              <nav
                ref={navbarRef}
                id="navbarCollapse"
                className={cn(
                  `navbar absolute right-0  rounded border-[.5px] border-body-color/50 bg-white px-6 py-4 duration-300`,
                  `dark:border-body-color/20 dark:bg-dark lg:visible lg:static lg:w-auto lg:border-none lg:!bg-transparent lg:p-0 lg:opacity-100`,
                  `${
                    navbarOpen && isSmallScreen
                      ? "visibility top-[70%] w-full opacity-100"
                      : "invisible top-[120%] opacity-0"
                  }`,
                  `${
                    isSmallScreen
                      ? "max-h-[calc(100vh-120px)] overflow-y-auto"
                      : "overflow-visible"
                  }`,
                )}
              >
                <ul className="block lg:flex lg:space-x-12">
                  {menuData.map((menuItem, index) => (
                    <li key={index} className="group relative">
                      {menuItem.path ? (
                        <Link
                          onClick={() => setNavbarOpen(false)}
                          href={menuItem.path}
                          className={`flex py-2 text-xl lg:mr-0 lg:inline-flex lg:px-0 lg:py-6 ${
                            pathname === menuItem.path
                              ? "text-primary dark:text-white"
                              : "text-dark hover:text-primary dark:text-white/70 dark:hover:text-white"
                          }`}
                        >
                          {menuItem.title}
                        </Link>
                      ) : (
                        <>
                          <p
                            onClick={() => handleSubmenu(index)}
                            className="flex cursor-pointer items-center justify-between py-2 text-xl text-dark group-hover:text-primary dark:text-white/70 dark:group-hover:text-white lg:mr-0 lg:inline-flex lg:px-0 lg:py-6"
                          >
                            {menuItem.title}
                            <span className="pl-3">
                              <svg width="25" height="24" viewBox="0 0 25 24">
                                <path
                                  fillRule="evenodd"
                                  clipRule="evenodd"
                                  d="M6.29289 8.8427C6.68342 8.45217 7.31658 8.45217 7.70711 8.8427L12 13.1356L16.2929 8.8427C16.6834 8.45217 17.3166 8.45217 17.7071 8.8427C18.0976 9.23322 18.0976 9.86639 17.7071 10.2569L12 15.964L6.29289 10.2569C5.90237 9.86639 5.90237 9.23322 6.29289 8.8427Z"
                                  fill="currentColor"
                                />
                              </svg>
                            </span>
                          </p>
                          <div
                            className={cn(
                              `submenu relative left-4 top-full rounded-sm bg-white transition-[top] duration-300 group-hover:opacity-100 dark:bg-dark`,
                              `lg:invisible lg:absolute lg:top-[110%] lg:rounded-lg lg:opacity-0 lg:shadow-lg lg:group-hover:visible lg:group-hover:top-full`,
                              `  lg:mr-6 lg:p-4`,
                              `${openIndex === index ? "flex flex-col lg:flex-row" : "hidden"}`,
                            )}
                          >
                            {serviceData.map((serviceItem) => (
                              <div
                                key={serviceItem.title}
                                className="lg:text-nowrap lg:px-4 lg:py-2 "
                              >
                                <p
                                  className={cn(
                                    "cursor-default rounded py-2.5 text-lg text-dark transition dark:text-white ",
                                  )}
                                >
                                  {serviceItem.title}
                                </p>
                                {serviceItem.subServices.map(
                                  (subService) =>
                                    subService.path && (
                                      <Link
                                        onClick={() => setNavbarOpen(false)}
                                        href={`/services${subService.path}`}
                                        key={subService.title}
                                        className={cn(
                                          "block  px-2 py-1.5 text-sm  text-dark transition hover:bg-primary hover:bg-opacity-10 dark:text-white",
                                        )}
                                      >
                                        {subService.title}
                                      </Link>
                                    ),
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </li>
                  ))}

                  {/* Language Selector inside navbar for small screens */}
                  <li className="block lg:hidden">
                    <div className="mt-4 flex items-center justify-between space-x-2 rounded border border-gray-300 bg-gray-100 p-1 dark:border-gray-600 dark:bg-gray-800">
                      <div className="flex space-x-2">
                        <button
                          className={cn(
                            "rounded-sm px-4 py-2 text-sm font-medium",
                            locale === "en"
                              ? "bg-primary text-white"
                              : "text-dark hover:bg-opacity-90 dark:text-white",
                          )}
                          onClick={() => {
                            changeLocale("en");
                            setNavbarOpen(false);
                          }}
                        >
                          EN
                        </button>
                        <button
                          className={cn(
                            "rounded-sm px-4 py-2 text-sm font-medium",
                            locale === "de"
                              ? "bg-primary text-white"
                              : "text-dark hover:bg-opacity-90 dark:text-white",
                          )}
                          onClick={() => {
                            changeLocale("de");
                            setNavbarOpen(false);
                          }}
                        >
                          DE
                        </button>
                      </div>

                      <ThemeToggler />
                    </div>
                  </li>
                </ul>
              </nav>
            </div>

            <div className="hidden items-center justify-end pr-16 lg:flex lg:pr-0">
              <div className="flex items-center space-x-2 rounded border border-gray-300 bg-gray-100 p-1 dark:border-gray-600 dark:bg-gray-800">
                <button
                  className={cn(
                    "rounded-sm px-4 py-2 text-sm font-medium",
                    locale === "en"
                      ? "bg-primary text-white"
                      : "text-dark hover:bg-opacity-90 dark:text-white",
                  )}
                  onClick={() => {
                    changeLocale("en");
                    setNavbarOpen(false);
                  }}
                >
                  EN
                </button>
                <button
                  className={cn(
                    "rounded-sm px-4 py-2 text-sm font-medium",
                    locale === "de"
                      ? "bg-primary text-white"
                      : "text-dark hover:bg-opacity-90 dark:text-white",
                  )}
                  onClick={() => {
                    changeLocale("de");
                    setNavbarOpen(false);
                  }}
                >
                  DE
                </button>
              </div>

              <div>
                <ThemeToggler />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
