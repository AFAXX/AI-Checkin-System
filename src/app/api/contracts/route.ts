import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - List all contracts
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();

    const contracts = await db.contract.findMany({
      where: search
        ? {
            OR: [
              { reservationNumber: { contains: search } },
              { customerName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : undefined,
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

// POST - Create a single contract manually
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const contract = await db.contract.create({
      data: {
        reservationNumber: body.reservationNumber || `MANUAL-${Date.now()}`,
        customerName: body.customerName || 'Unknown',
        customerEmail: body.customerEmail || '',
        vehicleReg: body.vehicleReg || '',
        vehicleModel: body.vehicleModel || '',
        pickupDate: body.pickupDate ? new Date(body.pickupDate) : new Date(),
        returnDate: body.returnDate ? new Date(body.returnDate) : null,
        status: body.status || 'checkout_pending',
        locationCode: body.locationCode || 'MLA',
      },
    });
    return NextResponse.json(contract);
  } catch (error) {
    console.error('Error creating contract:', error);
    return NextResponse.json({ error: 'Failed to create contract' }, { status: 500 });
  }
}

// PATCH - Update contract (status, returnDate, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, returnDate, ...rest } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing contract id' }, { status: 400 });
    }

    const data: Record<string, any> = { ...rest, updatedAt: new Date() };
    if (status) data.status = status;
    if (returnDate !== undefined) {
      data.returnDate = returnDate ? new Date(returnDate) : null;
    }

    const updated = await db.contract.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating contract:', error);
    return NextResponse.json({ error: 'Failed to update contract' }, { status: 500 });
  }
}

// DELETE - Delete a contract by id
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing contract id' }, { status: 400 });
    }

    await db.contract.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting contract:', error);
    return NextResponse.json({ error: 'Failed to delete contract' }, { status: 500 });
  }
}
