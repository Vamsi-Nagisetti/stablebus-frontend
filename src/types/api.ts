export type City = {
  cityID: number | string;
  cityName: string;
  [k: string]: unknown;
};

export type CitiesResponse = {
  cityDetails?: City[];
  [k: string]: unknown;
};

export type BusSearchRequest = {
  from_city: string | number;
  to_city: string | number;
  travel_date: string;
  [k: string]: unknown;
};

export type ProviderSeat = {
  seat_Number: string;
  row: number | string;
  column: number | string;
  length: number | string;
  width: number | string;
  zIndex: number | string;
  bookable: boolean;
  ladies_Seat?: boolean;
  fareMaster?: unknown;
  seat_Key: string;
  [k: string]: unknown;
};

export type SeatMapResponse = {
  seatMap?: ProviderSeat[];
  boardingDetails?: any[];
  droppingDetails?: any[];
  dropPoint_Mandatory?: boolean;
  required_PAX_Detail?: unknown;
  [k: string]: unknown;
};

export type RequeryResponse = {
  booking_id: string;
  booking_status: string;
  supplier_refno?: string;
  transport_pnr?: string;
  message?: string;
};