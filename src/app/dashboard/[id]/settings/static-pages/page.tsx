'use client';

import { StaticPagesManager } from './_components/StaticPagesManager';

export default function StaticPagesSettingsPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Static Pages</h1>
        <p className="text-gray-600">
          Manage your static landing content pages.
        </p>
      </div>

      <div>
        <StaticPagesManager />
      </div>
    </div>
  );
}
