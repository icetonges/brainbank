"use client";

import { useState } from "react";

/**
 * The AI Classroom's subcategory picker — a <select> of existing values
 * (classroom_subcategories, sorted A→Z by the server) with an "add new"
 * option that reveals a plain text input. Submits as part of whatever
 * <form action={serverAction}> it's nested in: `subcategoryId` (the
 * selected row's id, or "__new__" when adding) and `newSubcategory` (only
 * meaningful — and only shown — when "add new" is selected). The server
 * action treats a non-empty newSubcategory as authoritative over
 * subcategoryId (see resolveSubcategoryId in classroom/actions.ts), so
 * this component doesn't need to coordinate anything with the parent
 * form beyond rendering inputs with the right `name`s.
 */
export function SubcategoryField({
  options,
  defaultId,
  className,
  labels,
}: {
  options: { id: number; name: string }[];
  defaultId?: number | null;
  className?: string;
  labels: {
    none: string;
    addNew: string;
    newPlaceholder: string;
  };
}) {
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div className="flex flex-1 flex-col gap-2 sm:min-w-[200px]">
      <select
        name="subcategoryId"
        defaultValue={defaultId ? String(defaultId) : ""}
        onChange={(e) => setAddingNew(e.target.value === "__new__")}
        className={className}
      >
        <option value="">{labels.none}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
        <option value="__new__">{labels.addNew}</option>
      </select>
      {addingNew && (
        <input
          type="text"
          name="newSubcategory"
          placeholder={labels.newPlaceholder}
          autoFocus
          className={className}
        />
      )}
    </div>
  );
}
