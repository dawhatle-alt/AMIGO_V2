import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="card p-6">
      <h1 className="text-[15px] font-bold text-gray-900">No such screen</h1>
      <p className="mt-1 text-[13px] text-gray-600">
        AMIGO Concierge has six screens: Home, Intake, Facts Review, Gap Walkthrough, Upgrade Plan and
        Runbook. Use the navigation bar, or start from Home.
      </p>
      <Link
        href="/"
        className="mt-3 inline-block rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white hover:bg-primary-hover"
      >
        Go to Home
      </Link>
    </section>
  );
}
