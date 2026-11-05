// Real delivery tracking statuses extracted from Indecx API statusEvents (now stored directly in database nps_records)
export interface IndecxDeliveryTrackingInfo {
  status: "Enviado" | "Entregue" | "Aberto" | "Não entregue" | "Em processamento";
  events: string[];
  lastEventAt: string;
  bounceReason?: string;
}

export const INDECX_REAL_DELIVERY_BY_CONTROL_ID: Record<string, IndecxDeliveryTrackingInfo> = {};
