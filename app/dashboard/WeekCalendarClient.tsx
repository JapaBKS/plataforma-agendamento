"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarGrid, CalendarColumn, CalendarAppointment } from "@/components/CalendarGrid";
import {
  QuickCreateModal,
  AppointmentDetailModal,
  ServiceOption,
  ProfessionalOption,
} from "@/components/AppointmentModals";

/**
 * Monta a data no fuso LOCAL do navegador a partir de "yyyy-MM-dd".
 * Usar `new Date("2026-07-28T00:00:00.000Z")` daria o dia anterior no Brasil,
 * porque o ISO com "Z" é meia-noite UTC (= 21h do dia anterior aqui).
 */
function parseLocalDate(yyyyMmDd: string) {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function WeekCalendarClient({
  columns,
  columnDates,
  professionals,
  servicesByProfessional,
  patientLabel,
}: {
  columns: CalendarColumn[];
  columnDates: string[]; // "yyyy-MM-dd" - montado como data local no navegador
  professionals: ProfessionalOption[];
  servicesByProfessional: Record<string, ServiceOption[]>;
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

  return (
    <>
      <CalendarGrid
        columns={columns}
        columnDates={columnDates.map(parseLocalDate)}
        onSlotClick={(_, start) => setNewSlotStart(start)}
        onAppointmentClick={(appointment) => setSelected(appointment)}
      />

      {newSlotStart && (
        <QuickCreateModal
          professionals={professionals}
          servicesByProfessional={servicesByProfessional}
          start={newSlotStart}
          patientLabel={patientLabel}
          onClose={() => setNewSlotStart(null)}
          onCreated={refresh}
        />
      )}

      {selected && (
        <AppointmentDetailModal
          appointment={selected}
          professionals={professionals}
          servicesByProfessional={servicesByProfessional}
          patientLabel={patientLabel}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      )}
    </>
  );
}
