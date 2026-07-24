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
    const type = formData.get('type') as string | null; // "checkout" or "checkin"

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
      return NextResponse.json({ error: 'No data rows found' }, { status: 400 });
    }

    const created: any[] = [];
    const errors: any[] = [];

    // Determine type from file name if not passed
    const fileName = file.name.toLowerCase();
    const isCheckinFile = type === 'checkin' || fileName.includes('check-in');
    const isCheckoutFile = type === 'checkout' || fileName.includes('check-out');

    for (const row of rows) {
      try {
        const reservationNumber =
          row['Confirmation #'] || row['Rental'] || row['Voucher #'] || `RES-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const customerName =
          row['Customer'] || row['customer'] || 'Unknown';
        const vehicleReg =
          row['Vehicle'] || row['vehicle'] || '';
        const vehicleModel =
          row['Model'] || row['model'] || '';
        const station =
          row['Station'] || row['station'] || 'MLA';
        const days = row['Days'] || 0;
        const timeVal = row['Time'] || null;
        const pickupDate = parseDate(timeVal) || new Date();

        let returnDate: Date | null = null;
        if (days && typeof days === 'number' && days > 0) {
          returnDate = new Date(pickupDate);
          returnDate.setDate(returnDate.getDate() + days);
        }

        // Check-out file → customer picking up car → awaiting pickup inspection
        // Check-in file → customer dropping off car → awaiting return inspection
        const contractStatus = isCheckinFile ? 'return_pending' : 'checkout_pending';

        // Check if contract already exists by confirmation number
        const existing = await db.contract.findFirst({
          where: { reservationNumber: String(reservationNumber) },
        });

        if (existing) {
          // Update existing contract status
          const newStatus = isCheckinFile ? 'return_pending' : existing.status;
          await db.contract.update({
            where: { id: existing.id },
            data: { status: newStatus, vehicleReg: String(vehicleReg), vehicleModel: String(vehicleModel) },
          });
          created.push(existing);
        } else {
          const contract = await db.contract.create({
            data: {
              reservationNumber: String(reservationNumber),
              customerName: String(customerName),
              customerEmail: '',
              vehicleReg: String(vehicleReg),
              vehicleModel: String(vehicleModel),
              pickupDate,
              returnDate,
              status: contractStatus,
              locationCode: String(station),
            },
          });
          created.push(contract);
        }
      } catch (err: any) {
        errors.push({ error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      imported: created.length,
      total: rows.length,
      type: isCheckinFile ? 'checkin' : 'checkout',
      errors: errors.length,
      contracts: created,
    });
  } catch (error) {
    console.error('Error importing Excel:', error);
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 });
  }
}
