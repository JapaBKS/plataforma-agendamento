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

export function WeekCalendarClient({
  columns,
  columnDates,
  professionals,
  servicesByProfessional,
  patientLabel,
}: {
  columns: CalendarColumn[];
  columnDates: string[]; // ISO - Server Components não passam Date direto pra client
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
        columnDates={columnDates.map((d) => new Date(d))}
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
        <AppointmentDetailModal appointment={selected} onClose={() => setSelected(null)} onChanged={refresh} />
      )}
    </>
  );
}
