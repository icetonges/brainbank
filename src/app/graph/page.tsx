export default function GraphPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold text-fg">Interactive graph</h1>
      <p className="max-w-md text-fg-secondary">
        The connection graph renders here once there are notes and links to
        show. This view is built in a later phase (see PLAN.md §7).
      </p>
    </div>
  );
}
