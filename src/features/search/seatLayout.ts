import type {ProviderSeat} from '@/types/api';
export type SeatCell={seat:ProviderSeat;row:number;column:number;rowSpan:number;colSpan:number;deck:0|1};
export function toSeatCells(seats:ProviderSeat[]):SeatCell[]{return seats.map(seat=>({seat,row:Number(seat.row),column:Number(seat.column),rowSpan:Math.max(1,Number(seat.length)||1),colSpan:Math.max(1,Number(seat.width)||1),deck:Number(seat.zIndex)===1?1:0}));}
