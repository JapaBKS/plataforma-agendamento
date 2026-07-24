"use client";

export function MonthPicker({ defaultValue }: { defaultValue: string }) {
  return (
    <form>
      <input
        type="month"
        name="month"
        defaultValue={defaultValue}
        className="rounded-lg px-3 py-2 text-sm outline-none"
        style={{ border: "1px solid var(--line)" }}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  );
}
