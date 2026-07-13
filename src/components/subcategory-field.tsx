"use client";

import { useState } from "react";

interface SubcategoryOption {
  id: number;
  name: string;
}

interface SectionOption {
  id: number;
  name: string;
  subcategoryId: number;
}

/**
 * The AI Classroom's subcategory + section pickers, rendered together
 * because a section always belongs to exactly one subcategory (one
 * subcategory, many sections) — the section <select> is filtered down to
 * whichever subcategory is currently chosen and resets whenever that
 * changes. Both are <select>s of existing values (classroom_subcategories /
 * classroom_sections, sorted A→Z by the server) with an "add new" option
 * that reveals a plain text input.
 *
 * Submits as part of whatever <form action={serverAction}> it's nested in:
 * `subcategoryId`/`newSubcategory` and `sectionId`/`newSection`. The server
 * action treats a non-empty "new" field as authoritative over the matching
 * id (see resolveSubcategoryId/resolveSectionId in classroom/actions.ts),
 * and resolves the subcategory first so a brand-new section typed alongside
 * a brand-new subcategory still ends up nested under it correctly — this
 * component doesn't need to know the future ids, just submit the names.
 */
export function SubcategoryField({
  options,
  sections = [],
  defaultId,
  defaultSectionId,
  className,
  labels,
}: {
  options: SubcategoryOption[];
  sections?: SectionOption[];
  defaultId?: number | null;
  defaultSectionId?: number | null;
  className?: string;
  labels: {
    none: string;
    addNew: string;
    newPlaceholder: string;
    sectionNone: string;
    sectionAddNew: string;
    sectionNewPlaceholder: string;
  };
}) {
  const [subcategoryValue, setSubcategoryValue] = useState(
    defaultId ? String(defaultId) : "",
  );
  const [addingSubcategory, setAddingSubcategory] = useState(false);
  const [sectionValue, setSectionValue] = useState(
    defaultSectionId ? String(defaultSectionId) : "",
  );
  const [addingSection, setAddingSection] = useState(false);

  const selectedSubcategoryId =
    subcategoryValue && subcategoryValue !== "__new__" ? Number(subcategoryValue) : null;
  const filteredSections = selectedSubcategoryId
    ? sections.filter((sec) => sec.subcategoryId === selectedSubcategoryId)
    : [];

  return (
    <>
      <div className="flex flex-1 flex-col gap-2 sm:min-w-[200px]">
        <select
          name="subcategoryId"
          value={subcategoryValue}
          onChange={(e) => {
            const v = e.target.value;
            setSubcategoryValue(v);
            setAddingSubcategory(v === "__new__");
            // Switching subcategories invalidates whatever section was
            // picked for the old one — a section from another subcategory
            // (or one that no longer applies) shouldn't silently carry over.
            setSectionValue("");
            setAddingSection(false);
          }}
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
        {addingSubcategory && (
          <input
            type="text"
            name="newSubcategory"
            placeholder={labels.newPlaceholder}
            autoFocus
            className={className}
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 sm:min-w-[200px]">
        <select
          name="sectionId"
          value={sectionValue}
          disabled={!subcategoryValue}
          onChange={(e) => {
            const v = e.target.value;
            setSectionValue(v);
            setAddingSection(v === "__new__");
          }}
          className={`${className ?? ""} disabled:opacity-50`}
        >
          <option value="">{labels.sectionNone}</option>
          {filteredSections.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value="__new__">{labels.sectionAddNew}</option>
        </select>
        {addingSection && (
          <input
            type="text"
            name="newSection"
            placeholder={labels.sectionNewPlaceholder}
            autoFocus
            className={className}
          />
        )}
      </div>
    </>
  );
}
