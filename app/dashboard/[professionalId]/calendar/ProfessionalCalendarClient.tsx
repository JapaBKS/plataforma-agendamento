"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarGrid, CalendarColumn, CalendarAppointment } from "@/components/CalendarGrid";
import { QuickCreateModal, AppointmentDetailModal, ServiceOption } from "@/components/AppointmentModals";

export function ProfessionalCalendarClient({
  date,
  professionalId,
  professionalLabel,
  columns,
  services,
  patientLabel,
}: {
  date: Date;
  professionalId: string;
  professionalLabel: string;
  columns: CalendarColumn[];
  services: ServiceOption[];
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
        date={date}
        columns={columns}
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
