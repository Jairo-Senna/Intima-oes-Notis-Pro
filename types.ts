
export interface DeliveryPerson {
  id: string;
  name: string;
  cpf?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  pix?: string;
  route?: string;
}

export interface Batch {
  id: string;
  deliveryPersonId: string;
  pgfnInitial: number;
  normalInitial: number;
  departureDatetime: string;
  estimatedReturnDate: string;
  status: 'pending' | 'finalized';
  description: string;
  // Finalized fields
  pgfnDelivered?: number;
  pgfnReturned?: number;
  pgfnAbsent?: number;
  normalDelivered?: number;
  normalReturned?: number;
  normalAbsent?: number;
  totalValue?: number;
  returnDatetime?: string;
}

export enum View {
  Dashboard,
  Archive,
  DeliveryPeople,
  AddDeliveryPerson,
  DeliveryPersonProfile,
}