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

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Auto-detect type from filename
    let type = (formData.get('type') as string) || '';
    if (!type) {
      const fname = file.name.toLowerCase();
      if (fname.includes('check-in') || fname.includes('checkin')) {
        type = 'checkin';
      } else if (fname.includes('check-out') || fname.includes('checkout')) {
        type = 'checkout';
      } else {
        type = 'checkout';
      }
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
        // ── Common fields ──
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

        if (type === 'checkout') {
          // ═══ CHECK-OUT (pickup) ═══
          // Status = 'checkout_pending' → appears in Check-Outs tab
          const days = row['Days'] || row['days'] || 0;
          let returnDate: Date | null = null;
          if (days && typeof days === 'number' && days > 0) {
            returnDate = new Date(parsedDate);
            returnDate.setDate(returnDate.getDate() + days);
          }

          const existing = await db.contract.findFirst({
            where: { reservationNumber: String(reservationNumber) },
          });

          if (existing) {
            await db.contract.update({
              where: { id: existing.id },
              data: {
                status: 'checkout_pending',
                vehicleReg: String(vehicleReg) || existing.vehicleReg,
                vehicleModel: String(vehicleModel) || existing.vehicleModel,
                pickupDate: parsedDate,
                returnDate: returnDate || existing.returnDate,
                customerName: String(customerName) || existing.customerName,
                updatedAt: new Date(),
              },
            });
            created.push({ ...existing, updated: true, type: 'checkout' });
          } else {
            const contract = await db.contract.create({
              data: {
                reservationNumber: String(reservationNumber),
                customerName: String(customerName),
                customerEmail: String(customerEmail),
                vehicleReg: String(vehicleReg),
                vehicleModel: String(vehicleModel),
                pickupDate: parsedDate,
                returnDate,
                status: 'checkout_pending',
                locationCode: String(station),
              },
            });
            created.push({ ...contract, type: 'checkout' });
          }

        } else {
          // ═══ CHECK-IN (drop-off / return) ═══
          // Status = 'checkin_pending' → appears in Check-Ins tab
          // Does NOT go to archive — only goes to archive after signature
          const days = row['Days'] || row['days'] || 0;
          let returnDate: Date | null = null;
          if (days && typeof days === 'number' && days > 0) {
            returnDate = new Date(parsedDate);
            returnDate.setDate(returnDate.getDate() + days);
          }

          const existing = await db.contract.findFirst({
            where: { reservationNumber: String(reservationNumber) },
          });

          if (existing) {
            // Contract exists (was uploaded as checkout) → move to checkin queue
            await db.contract.update({
              where: { id: existing.id },
              data: {
                status: 'checkin_pending',
                returnDate: returnDate || parsedDate,
                vehicleReg: String(vehicleReg) || existing.vehicleReg,
                vehicleModel: String(vehicleModel) || existing.vehicleModel,
                customerName: String(customerName) || existing.customerName,
                updatedAt: new Date(),
              },
            });
            created.push({ ...existing, updated: true, type: 'checkin' });
          } else {
            // No existing checkout → create directly in checkin queue
            const contract = await db.contract.create({
              data: {
                reservationNumber: String(reservationNumber),
                customerName: String(customerName),
                customerEmail: String(customerEmail),
                vehicleReg: String(vehicleReg),
                vehicleModel: String(vehicleModel),
                pickupDate: parsedDate,
                returnDate: returnDate || parsedDate,
                status: 'checkin_pending',
                locationCode: String(station),
              },
            });
            created.push({ ...contract, type: 'checkin' });
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
