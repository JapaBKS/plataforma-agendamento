import { BusinessType } from "@prisma/client";

/**
 * Cada tenant tem um "vocabulário" próprio, mesmo usando as mesmas tabelas.
 * Ex: o que é "Professional"/"Appointment"/"Patient" no schema vira
 * "Barbeiro"/"Corte"/"Cliente" na tela de uma barbearia, e
 * "Profissional"/"Consulta"/"Paciente" numa clínica.
 *
 * `customLabels` no Tenant sobrescreve qualquer termo individualmente,
 * então o vendedor não precisa de um businessType novo pra cada cliente
 * com um termo ligeiramente diferente.
 */
export interface Labels {
  professional: string; // singular
  professionalPlural: string;
  appointment: string;
  appointmentPlural: string;
  patient: string; // "cliente" / "paciente"
}

const DEFAULTS: Record<BusinessType, Labels> = {
  BARBEARIA: {
    professional: "Barbeiro",
    professionalPlural: "Barbeiros",
    appointment: "Corte",
    appointmentPlural: "Cortes",
    patient: "Cliente",
  },
  CLINICA: {
    professional: "Profissional",
    professionalPlural: "Profissionais",
    appointment: "Consulta",
    appointmentPlural: "Consultas",
    patient: "Paciente",
  },
  ESTETICA: {
    professional: "Especialista",
    professionalPlural: "Especialistas",
    appointment: "Sessão",
    appointmentPlural: "Sessões",
    patient: "Cliente",
  },
  OUTRO: {
    professional: "Profissional",
    professionalPlural: "Profissionais",
    appointment: "Agendamento",
    appointmentPlural: "Agendamentos",
    patient: "Cliente",
  },
};

export function getLabels(
  businessType: BusinessType,
  customLabels?: unknown
): Labels {
  const base = DEFAULTS[businessType] ?? DEFAULTS.OUTRO;
  if (customLabels && typeof customLabels === "object") {
    return { ...base, ...(customLabels as Partial<Labels>) };
  }
  return base;
}
