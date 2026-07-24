import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Convert Excel serial number date to JS Date
function excelDateToDate(serial: number): Date {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
}

// Parse any date value from Excel (serial number, Date object, or string)
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
    const type = (formData.get('type') as string) || 'checkout';

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
        // ── Common fields (present in both Check-outs and Check-ins) ──
        const reservationNumber =
          row['Confirmation #'] || row['Rental'] || row['Voucher #'] || `RES-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

        // ── Date parsing ──
        const timeVal = row['Time'] || row['time'] || null;
        const parsedDate = parseDate(timeVal) || new Date();

        // ── Type-specific mapping ──
        if (type === 'checkin') {
          // ── CHECK-IN (drop-off / return) mapping ──
          const fuelType = row['Fuel type'] || row['Fuel'] || row['fuel'] || '';
          const transmission = row['Transmission'] || row['transmission'] || '';
          const days = row['Days'] || row['days'] || 0;
          const checkinLocation = row['Check-in location'] || row['Location'] || '';
          const mileage = row['Mileage'] || row['mileage'] || '';
          const fuelLevel = row['Fuel level'] || row['fuel level'] || '';
          const damageNotes = row['Damage notes'] || row['damage notes'] || row['Damage Notes'] || '';
          const checkinBy = row['Check-in by'] || row['check-in by'] || '';
          const voucherNumber = row['Voucher #'] || row['Voucher'] || '';
          const corporate = row['Corporate'] || row['corporate'] || '';
          const status = row['Status'] || '';

          // Calculate return date based on days
          let returnDate: Date | null = null;
          if (days && typeof days === 'number' && days > 0) {
            returnDate = new Date(parsedDate);
            returnDate.setDate(returnDate.getDate() + days);
          }

          // Check if contract already exists by reservation number
          const existing = await db.contract.findFirst({
            where: { reservationNumber: String(reservationNumber) },
          });

          if (existing) {
            // Update existing contract with check-in data
            await db.contract.update({
              where: { id: existing.id },
              data: {
                status: 'completed',
                returnDate: returnDate || parsedDate,
                vehicleReg: String(vehicleReg) || existing.vehicleReg,
                vehicleModel: String(vehicleModel) || existing.vehicleModel,
                updatedAt: new Date(),
              },
            });
            created.push({ ...existing, updated: true, type: 'checkin' });
          } else {
            // Create new contract as completed check-in
            const contract = await db.contract.create({
              data: {
                reservationNumber: String(reservationNumber),
                customerName: String(customerName),
                customerEmail: String(customerEmail),
                vehicleReg: String(vehicleReg),
                vehicleModel: String(vehicleModel),
                pickupDate: parsedDate,
                returnDate: returnDate || parsedDate,
                status: 'completed',
                locationCode: String(station),
              },
            });
            created.push({ ...contract, type: 'checkin' });
          }
        } else {
          // ── CHECK-OUT (pickup) mapping ──
          const fuelLevel = row['Fuel level'] || row['fuel level'] || '';
          const damageNotes = row['Damage notes'] || row['damage notes'] || row['Damage Notes'] || '';
          const checkoutBy = row['Check-out by'] || row['check-out by'] || '';
          const checkoutLocation = row['Check-out location'] || row['Location'] || '';
          const arrivalDetails = row['Arrival details'] || row['arrival details'] || '';
          const voucherNumber = row['Voucher #'] || row['Voucher'] || '';
          const cGroup = row['C Group'] || row['c group'] || '';
          const status = row['Status'] || '';

          // For check-outs, pickup date is the event date
          // Return date is unknown until check-in happens
          const days = row['Days'] || row['days'] || 0;
          let returnDate: Date | null = null;
          if (days && typeof days === 'number' && days > 0) {
            returnDate = new Date(parsedDate);
            returnDate.setDate(returnDate.getDate() + days);
          }

          const contractStatus = status === 'RES' ? 'pickup_pending' : 'active';

          // Check if contract already exists by reservation number
          const existing = await db.contract.findFirst({
            where: { reservationNumber: String(reservationNumber) },
          });

          if (existing) {
            // Update existing contract with checkout data
            await db.contract.update({
              where: { id: existing.id },
              data: {
                status: contractStatus,
                vehicleReg: String(vehicleReg) || existing.vehicleReg,
                vehicleModel: String(vehicleModel) || existing.vehicleModel,
                pickupDate: parsedDate,
                updatedAt: new Date(),
              },
            });
            created.push({ ...existing, updated: true, type: 'checkout' });
          } else {
            // Create new contract for checkout
            const contract = await db.contract.create({
              data: {
                reservationNumber: String(reservationNumber),
                customerName: String(customerName),
                customerEmail: String(customerEmail),
                vehicleReg: String(vehicleReg),
                vehicleModel: String(vehicleModel),
                pickupDate: parsedDate,
                returnDate,
                status: contractStatus,
                locationCode: String(station),
              },
            });
            created.push({ ...contract, type: 'checkout' });
          }
        }
      } catch (err: any) {
        errors.push({
          row: String(JSON.stringify(row).substring(0, 200)),
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      imported: created.length,
      total: rows.length,
      errors: errors.length,
      errorDetails: errors,
      contracts: created,
      type,
    });
  } catch (error) {
    console.error('Error importing Excel:', error);
    return NextResponse.json({ error: 'Failed to import Excel file' }, { status: 500 });
  }
}
