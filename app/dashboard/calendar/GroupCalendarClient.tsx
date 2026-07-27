"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarGrid, CalendarColumn, CalendarAppointment } from "@/components/CalendarGrid";
import { QuickCreateModal, AppointmentDetailModal, ServiceOption } from "@/components/AppointmentModals";

/** Monta a data no fuso local do navegador a partir de "yyyy-MM-dd". */
function parseLocalDate(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function GroupCalendarClient({
  date,
  columns,
  servicesByProfessional,
  professionalLabel,
  patientLabel,
}: {
  date: string; // "yyyy-MM-dd"
  columns: CalendarColumn[];
  servicesByProfessional: Record<string, ServiceOption[]>;
  professionalLabel: string;
  patientLabel: string;
}) {
  const router = useRouter();
  const [newSlot, setNewSlot] = useState<{ professionalId: string; start: Date } | null>(null);
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);

  function refresh() {
    setNewSlot(null);
    setSelected(null);
    router.refresh();
  }

  const selectedColumn = newSlot ? columns.find((c) => c.id === newSlot.professionalId) : null;

  return (
    <>
      <CalendarGrid
        columns={columns}
        columnDates={columns.map(() => parseLocalDate(date))}
        onSlotClick={(professionalId, start) => setNewSlot({ professionalId, start })}
        onAppointmentClick={(appointment) => setSelected(appointment)}
      />

      {newSlot && selectedColumn && (
        <QuickCreateModal
          professionalId={newSlot.professionalId}
          professionalLabel={selectedColumn.label}
          start={newSlot.start}
          services={servicesByProfessional[newSlot.professionalId] ?? []}
          patientLabel={patientLabel}
          onClose={() => setNewSlot(null)}
          onCreated={refresh}
        />
      )}

      {selected && (
        <AppointmentDetailModal appointment={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      )}
    </>
  );
}
