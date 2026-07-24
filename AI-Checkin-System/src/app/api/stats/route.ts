import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const [totalContracts, inspectionsToday, inspectionsThisWeek, pendingInspections, recentComparisons] =
      await Promise.all([
        db.contract.count({ where: { status: 'active' } }),
        db.checkinVideo.count({ where: { createdAt: { gte: startOfDay } } }),
        db.checkinVideo.count({ where: { createdAt: { gte: startOfWeek } } }),
        db.contract.count({
          where: {
            status: 'active',
            inspections: { some: { status: 'pending_upload' } },
          },
        }),
        db.damageComparison.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            contract: true,
          },
        }),
      ]);

    return NextResponse.json({
      totalContracts,
      inspectionsToday,
      inspectionsThisWeek,
      pendingInspections,
      recentComparisons,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
