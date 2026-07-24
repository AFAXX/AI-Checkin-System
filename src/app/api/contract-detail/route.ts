import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const contract = await db.contract.findUnique({
      where: { id },
      include: {
        inspections: {
          include: { damageReport: true, recordedBy: true },
          orderBy: { createdAt: 'desc' },
        },
        comparisons: {
          include: { pickupReport: true, returnReport: true, reviewedBy: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    return NextResponse.json(contract);
  } catch (error) {
    console.error('Error fetching contract:', error);
    return NextResponse.json({ error: 'Failed to fetch contract' }, { status: 500 });
  }
}
