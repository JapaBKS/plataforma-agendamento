"use client";

export function DatePicker({ defaultValue }: { defaultValue: string }) {
  return (
    <form>
      <input
        type="date"
        name="date"
        defaultValue={defaultValue}
        className="rounded-lg px-3 py-2 text-sm outline-none"
        style={{ border: "1px solid var(--line)" }}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      />
    </form>
  );
}
