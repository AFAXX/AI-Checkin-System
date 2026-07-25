import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentTenantId } from '@/lib/tenant';

export async function GET(request: NextRequest) {
  try {
    const tenantId = await getCurrentTenantId();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const date = searchParams.get('date');
    const type = searchParams.get('type') || 'all';

    // Build where clause
    const whereConditions: Record<string, any>[] = [
      { tenantId },  // MODIFICATO: tenant filter obbligatorio
    ];

    // Text search
    if (search) {
      whereConditions.push({
        OR: [
          { reservationNumber: { contains: search } },
          { customerName: { contains: search, mode: 'insensitive' as const } },
          { vehicleModel: { contains: search, mode: 'insensitive' as const } },
          { vehicleReg: { contains: search, mode: 'insensitive' as const } },
        ],
      });
    }

    // Date filter
    if (date) {
      const dateConditions: Record<string, any>[] = [];
      if (type === 'pickup' || type === 'all') {
        dateConditions.push({ pickupDate: { startsWith: date } });
      }
      if (type === 'return' || type === 'all') {
        dateConditions.push({ returnDate: { startsWith: date } });
      }
      if (dateConditions.length > 0) {
        whereConditions.push({ OR: dateConditions });
      }
    }

    const where = whereConditions.length > 0
      ? (whereConditions.length === 1 ? whereConditions[0] : { AND: whereConditions })
      : undefined;

    const contracts = await db.contract.findMany({
      where,
      include: {
        inspections: {
          include: {
            damageReport: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        comparisons: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(contracts);
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json({ error: 'Failed to fetch contracts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const newContract = await db.contract.create({
      data: {
        reservationNumber: body.reservationNumber || `MAN-${Date.now()}`,
        customerName: body.customerName || '',
        customerEmail: body.customerEmail || '',
        vehicleReg: body.vehicleReg || 'TBD',
        vehicleModel: body.vehicleModel || 'TBD',
        pickupDate: body.pickupDate ? new Date(body.pickupDate) : new Date(),
        returnDate: body.returnDate ? new Date(body.returnDate) : null,
        status: body.status || 'checkout_pending',
        locationCode: body.locationCode || null,
      },
    });

    return NextResponse.json(newContract, { status: 201 });
  } catch (error: any) {
    if (error.message?.includes('Tenant not found')) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    console.error('Error creating contract:', error);
    return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 });
  }
}
