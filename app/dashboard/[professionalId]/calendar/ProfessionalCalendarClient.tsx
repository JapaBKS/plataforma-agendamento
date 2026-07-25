"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarGrid, CalendarColumn, CalendarAppointment, WorkingRange, computeHourRange } from "@/components/CalendarGrid";
import { QuickCreateModal, AppointmentDetailModal, ServiceOption } from "@/components/AppointmentModals";

/**
 * Monta a data no fuso LOCAL do navegador a partir de "yyyy-MM-dd".
 * Usar `new Date("2026-07-27T00:00:00.000Z")` daria o dia anterior no Brasil,
 * porque o ISO com "Z" é meia-noite UTC (= 21h do dia anterior aqui).
 */
function parseLocalDate(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function ProfessionalCalendarClient({
  date,
  professionalId,
  professionalLabel,
  columns,
  services,
  workingRanges,
  patientLabel,
}: {
  date: string; // "yyyy-MM-dd"
  professionalId: string;
  professionalLabel: string;
  columns: CalendarColumn[];
  services: ServiceOption[];
  workingRanges: WorkingRange[];
  patientLabel: string;
}) {
  const router = useRouter();
  const [newSlotStart, setNewSlotStart] = useState<Date | null>(null);
  const [selected, setSelected] = useState<CalendarAppointment | null>(null);

  function refresh() {
    setNewSlotStart(null);
    setSelected(null);
    router.refresh();
  }

  const range = computeHourRange(workingRanges);
  const startHour = Math.max(0, range.start - 1);
  const endHour = Math.min(24, range.end + 1);

  return (
    <>
      <CalendarGrid
        columns={columns}
        columnDates={[parseLocalDate(date)]}
        startHour={startHour}
        endHour={endHour}
        onSlotClick={(_, start) => setNewSlotStart(start)}
        onAppointmentClick={(appointment) => setSelected(appointment)}
      />

      {newSlotStart && (
        <QuickCreateModal
          professionalId={professionalId}
          professionalLabel={professionalLabel}
          start={newSlotStart}
          services={services}
          patientLabel={patientLabel}
          onClose={() => setNewSlotStart(null)}
          onCreated={refresh}
        />
      )}

      {selected && (
        <AppointmentDetailModal appointment={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      )}
    </>
  );
}
