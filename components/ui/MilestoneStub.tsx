import { Lock } from 'lucide-react';

/**
 * Placeholder for a screen whose behaviour arrives at a later milestone.
 * Keeps the shell navigable at M0 without faking any functionality.
 */
export function MilestoneStub({
  screen,
  milestone,
  title,
  scope,
}: {
  screen: string;
  milestone: string;
  title: string;
  scope: string[];
}) {
  return (
    <section className="card p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
          <Lock size={16} />
        </span>
        <div>
          <h1 className="text-[17px] font-bold text-gray-900">{title}</h1>
          <p className="font-mono text-[11px] text-gray-500">
            {screen} · arrives at {milestone}
          </p>
        </div>
      </div>

      <p className="mt-4 text-[13px] text-gray-600">
        Scaffolded at M0. This screen is built at {milestone}:
      </p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-[13px] text-gray-600">
        {scope.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </section>
  );
}
