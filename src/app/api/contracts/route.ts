import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
