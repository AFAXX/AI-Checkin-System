import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function excelDateToDate(serial: number): Date {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
}

function parseDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') return excelDateToDate(val);
  if (typeof val === 'string' && val) {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in Excel file' }, { status: 400 });
    }

    const created: any[] = [];
    const errors: any[] = [];

    for (const row of rows) {
      try {
        // Map Hertz Malta Excel columns to our contract fields
        // Check-ins: Status, Time, Vehicle, Group, Station, Rental, Voucher #, Confirmation #, Model, Fuel type, Transmission, Customer, Corporate, Days, etc.
        // Check-outs: Status, Time, Vehicle, Station, Rental, Voucher #, Confirmation #, Group, C Group, Model, etc.
        const reservationNumber =
          row['Confirmation #'] || row['Rental'] || row['Voucher #'] || `RES-${Date.now()}`;
        const customerName =
          row['Customer'] || row['customer'] || row['Customer Name'] || 'Unknown';
        const customerEmail = '';
        const vehicleReg =
          row['Vehicle'] || row['vehicle'] || row['Vehicle Reg'] || row['Plate'] || '';
        const vehicleModel =
          row['Model'] || row['model'] || row['Vehicle Model'] || '';
        const group =
          row['Group'] || row['C Group'] || row['group'] || '';
        const station =
          row['Station'] || row['station'] || 'MLA';
        const fuelType =
          row['Fuel type'] || row['Fuel'] || row['fuel'] || '';
        const transmission =
          row['Transmission'] || row['transmission'] || '';
        const days =
          row['Days'] || row['days'] || 0;

        // Determine if it's a check-in or check-out from status or context
        const status = row['Status'] || '';
        const isCheckin = status === 'RUN' || status === 'OUT' || !!row['Check-in location'] || !!row['Mileage'];
        const isCheckout = status === 'RES' || status === 'IN' || !!row['Check-out location'] || !!row['Arrival details'];

        // Parse the Time column for pickup/return dates
        const timeVal = row['Time'] || row['time'] || null;
        const pickupDate = parseDate(timeVal) || new Date();

        // Calculate return date based on days
        let returnDate: Date | null = null;
        if (days && typeof days === 'number' && days > 0) {
          returnDate = new Date(pickupDate);
          returnDate.setDate(returnDate.getDate() + days);
        }

        // Set contract status based on Excel status
        const contractStatus = isCheckin ? 'active' : isCheckout ? 'pickup_pending' : 'active';

        const contract = await db.contract.create({
          data: {
            reservationNumber: String(reservationNumber),
            customerName: String(customerName),
            customerEmail: String(customerEmail),
            vehicleReg: String(vehicleReg),
            vehicleModel: String(vehicleModel),
            pickupDate,
            returnDate,
            status: contractStatus,
            locationCode: String(station),
          },
        });

        created.push(contract);
      } catch (err: any) {
        errors.push({ row: String(JSON.stringify(row).substring(0, 100)), error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      imported: created.length,
      total: rows.length,
      errors: errors.length,
      contracts: created,
    });
  } catch (error) {
    console.error('Error importing Excel:', error);
    return NextResponse.json({ error: 'Failed to import Excel file' }, { status: 500 });
  }
}
