import { Metadata } from "next";
import Breadcrumb from "@/components/Common/Breadcrumb";
import Link from "next/link";

export const metadata: Metadata = {
  title: "User Data Deletion Instructions | UNENTER",
  description: "How to request deletion of your account and personal data from UNENTER.",
};

export default function DataDeletionPage() {
  return (
    <>
      <Breadcrumb pageName="User Data Deletion" description="Instructions to request data deletion" />

      <section className="relative bg-gray-light py-16 dark:bg-bg-color-dark md:py-20 lg:py-24">
        <div className="container max-w-4xl mx-auto px-4">
          <div className="rounded-lg bg-white p-8 shadow-sm dark:bg-dark sm:p-12">
            <h1 className="mb-6 text-3xl font-black text-black dark:text-white sm:text-4xl">
              User Data Deletion Instructions
            </h1>

            <div className="space-y-6 text-base leading-relaxed text-body-color dark:text-body-color-dark">
              <p>
                In accordance with Facebook Platform rules and standard data privacy regulations, users have the right to request the deletion of their personal data and authentication records from UNENTER.
              </p>

              <div className="rounded border border-black/10 bg-black/5 p-4 dark:border-white/10 dark:bg-white/5">
                <h2 className="mb-2 text-lg font-bold text-black dark:text-white">
                  Option 1: In-App Account Deletion
                </h2>
                <p className="mb-2">
                  1. Log in to your account on <Link href="https://unenter.live" className="text-primary underline">unenter.live</Link> or <Link href="https://tank.unenter.live" className="text-primary underline">tank.unenter.live</Link>.
                </p>
                <p className="mb-2">
                  2. Open your <strong>Account Profile / Settings</strong> overlay.
                </p>
                <p>
                  3. Click <strong>Delete Account & Data</strong> to permanently purge your profile, activity records, and OAuth credentials.
                </p>
              </div>

              <div className="rounded border border-black/10 bg-black/5 p-4 dark:border-white/10 dark:bg-white/5">
                <h2 className="mb-2 text-lg font-bold text-black dark:text-white">
                  Option 2: Revoke Access via Facebook
                </h2>
                <p className="mb-2">
                  1. Go to your Facebook profile <strong>Settings & Privacy</strong> &rarr; <strong>Settings</strong>.
                </p>
                <p className="mb-2">
                  2. Click on <strong>Apps and Websites</strong>.
                </p>
                <p className="mb-2">
                  3. Find <strong>UNENTER</strong> and click <strong>Remove</strong>.
                </p>
                <p>
                  4. Check the box to delete all posts, videos, or events that the app posted on your behalf and confirm removal.
                </p>
              </div>

              <div className="rounded border border-black/10 bg-black/5 p-4 dark:border-white/10 dark:bg-white/5">
                <h2 className="mb-2 text-lg font-bold text-black dark:text-white">
                  Option 3: Email Support Request
                </h2>
                <p>
                  Send an email to <a href="mailto:support@unenter.live" className="text-primary underline">support@unenter.live</a> with the subject <em>&quot;Data Deletion Request&quot;</em> along with your registered email address. Your data will be permanently deleted from all platform servers within 48 hours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
