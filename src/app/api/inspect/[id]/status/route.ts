import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const video = await db.checkinVideo.findUnique({
      where: { id },
      include: {
        damageReport: true,
        contract: {
          include: {
            inspections: {
              include: { damageReport: true },
            },
            comparisons: {
              include: { pickupReport: true, returnReport: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!video || !video.contract) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: video.id,
      kind: video.kind,
      status: video.status,
      createdAt: video.createdAt,
      damageReport: video.damageReport,
      comparison: (video.contract.comparisons || [])[0] || null,
    });
  } catch (error) {
    console.error('Error fetching inspection status:', error);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}
