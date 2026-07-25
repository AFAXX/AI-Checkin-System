import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentTenantId } from '@/lib/tenant';

export async function GET() {
  try {
    const tenantId = await getCurrentTenantId();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

    const [totalContracts, inspectionsToday, inspectionsThisWeek, pendingInspections, recentComparisons] =
      await Promise.all([
        db.contract.count({ where: { tenantId, status: 'active' } }),
        db.checkinVideo.count({ where: { tenantId, createdAt: { gte: startOfDay } } }),
        db.checkinVideo.count({ where: { tenantId, createdAt: { gte: startOfWeek } } }),
        db.contract.count({
          where: {
            tenantId,
            status: 'active',
            inspections: { some: { status: 'pending_upload' } },
          },
        }),
        db.damageComparison.findMany({
          where: { tenantId },
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
  } catch (error: any) {
    if (error.message?.includes('Tenant not found')) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }
    console.error('Error fetching stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
