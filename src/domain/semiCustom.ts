export type SemiSubformConfiguration = {
  schedule?: { timeFormat: 'start-end' | 'duration' };
  itemList?: { columns: string[] };
  sections?: Record<string, boolean>;
};

export type SemiSubformTemplate = {
  id?: string;
  name: string;
  active: boolean;
  configuration: SemiSubformConfiguration;
  createdAt?: string;
  updatedAt?: string;
};

export type SemiService = { code: string; name: string; category: string };

export type SemiCarePlanTemplate = {
  id?: string;
  name: string;
  structure: 'per-serv' | 'consolidated' | 'hybrid';
  services: SemiService[];
  participantFields?: string[];
  generalInfo?: Record<string, string[]>;
  servInfo?: Record<string, unknown>;
  assignments?: {
    serviceCode: string;
    subform: { id: string; name: string; configuration: SemiSubformConfiguration };
  }[];
  createdAt?: string;
  updatedAt?: string;
};
