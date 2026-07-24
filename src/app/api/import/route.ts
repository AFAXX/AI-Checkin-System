import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface ImportItem {
  rentalNumber: string;
  customerName: string;
  vehicleModel: string;
  vehicleReg: string;
  groupCode: string;
  fuelType: string;
  transmission: string;
  days: number;
  station: string;
  confirmation: string;
  pickupDate: string;
  returnDate: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, items } = body as { type: 'checkout' | 'checkin'; items: ImportItem[] };

    if (!type || !items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Missing type or items' }, { status: 400 });
    }

    if (!['checkout', 'checkin'].includes(type)) {
      return NextResponse.json({ error: 'type must be checkout or checkin' }, { status: 400 });
    }

    let created = 0;
    let updated = 0;
    let errors: string[] = [];

    for (const item of items) {
      try {
        if (!item.rentalNumber || !item.customerName) {
          errors.push(`Skipped: missing rental number or customer name`);
          continue;
        }

        if (type === 'checkout') {
          // Check-out: create new contract or update existing by reservationNumber
          const existing = await db.contract.findUnique({
            where: { reservationNumber: item.rentalNumber },
          });

          if (existing) {
            await db.contract.update({
              where: { reservationNumber: item.rentalNumber },
              data: {
                customerName: item.customerName,
                vehicleModel: item.vehicleModel || item.groupCode || existing.vehicleModel,
                vehicleReg: item.vehicleReg || existing.vehicleReg,
                pickupDate: item.pickupDate ? new Date(item.pickupDate) : existing.pickupDate,
                returnDate: item.returnDate ? new Date(item.returnDate) : existing.returnDate,
                locationCode: item.station || existing.locationCode,
                status: 'active',
              },
            });
            updated++;
          } else {
            await db.contract.create({
              data: {
                reservationNumber: item.rentalNumber,
                customerName: item.customerName,
                customerEmail: `${item.rentalNumber.toLowerCase()}@import.hertzmalta.com`,
                vehicleModel: item.vehicleModel || item.groupCode || 'TBD',
                vehicleReg: item.vehicleReg || 'TBD',
                pickupDate: item.pickupDate ? new Date(item.pickupDate) : new Date(),
                returnDate: item.returnDate ? new Date(item.returnDate) : null,
                locationCode: item.station || 'MLA',
                status: 'active',
              },
            });
            created++;
          }
        } else {
          // Check-in: try to match by rental number
          let existing = await db.contract.findUnique({
            where: { reservationNumber: item.rentalNumber },
          });

          if (existing) {
            await db.contract.update({
              where: { reservationNumber: item.rentalNumber },
              data: {
                vehicleReg: item.vehicleReg || existing.vehicleReg,
                vehicleModel: item.vehicleModel || existing.vehicleModel,
                returnDate: item.returnDate ? new Date(item.returnDate) : new Date(),
              },
            });
            updated++;
          } else {
            // Create new contract from check-in (return without prior checkout in system)
            await db.contract.create({
              data: {
                reservationNumber: item.rentalNumber,
                customerName: item.customerName,
                customerEmail: `${item.rentalNumber.toLowerCase()}@import.hertzmalta.com`,
                vehicleModel: item.vehicleModel || item.groupCode || 'TBD',
                vehicleReg: item.vehicleReg || 'TBD',
                pickupDate: item.pickupDate ? new Date(item.pickupDate) : new Date(),
                returnDate: item.returnDate ? new Date(item.returnDate) : new Date(),
                locationCode: item.station || 'MLA',
                status: 'active',
              },
            });
            created++;
          }
        }
      } catch (err: any) {
        errors.push(`Error for ${item.rentalNumber}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      type,
      created,
      updated,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  } catch (error) {
    console.error('Error importing:', error);
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 });
  }
}
