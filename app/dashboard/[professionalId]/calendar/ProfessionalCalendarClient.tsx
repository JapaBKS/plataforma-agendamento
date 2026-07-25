"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarGrid, CalendarColumn, CalendarAppointment, WorkingRange, computeHourRange } from "@/components/CalendarGrid";
import { QuickCreateModal, AppointmentDetailModal, ServiceOption } from "@/components/AppointmentModals";

export function ProfessionalCalendarClient({
  date,
  professionalId,
  professionalLabel,
  columns,
  services,
  workingRanges,
  patientLabel,
}: {
  date: string; // ISO
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

  // Mostra só a faixa de horas que importa (com uma folga de 1h de cada lado)
  const range = computeHourRange(workingRanges);
  const startHour = Math.max(0, range.start - 1);
  const endHour = Math.min(24, range.end + 1);

  return (
    <>
      <CalendarGrid
        columns={columns}
        columnDates={[new Date(date)]}
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
