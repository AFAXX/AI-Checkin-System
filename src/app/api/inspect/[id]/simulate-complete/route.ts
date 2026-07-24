import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

const DAMAGE_TEMPLATES = [
  { class: 'Scratch', severity: 'low', confidence: 87, location: 'Driver door' },
  { class: 'Dent', severity: 'medium', confidence: 92, location: 'Rear bumper' },
  { class: 'Crack', severity: 'high', confidence: 78, location: 'Windshield' },
  { class: 'Tire Damage', severity: 'medium', confidence: 85, location: 'Front left tire' },
  { class: 'Scratch', severity: 'low', confidence: 81, location: 'Hood' },
  { class: 'Dent', severity: 'high', confidence: 74, location: 'Front fender' },
];

function pickRandom(template: typeof DAMAGE_TEMPLATES, count: number) {
  const shuffled = [...template].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((d, i) => ({
    id: uuidv4(),
    ...d,
    confidence: d.confidence + Math.floor(Math.random() * 10 - 5),
    bbox: {
      x: Math.floor(Math.random() * 800),
      y: Math.floor(Math.random() * 600),
      width: Math.floor(Math.random() * 200 + 50),
      height: Math.floor(Math.random() * 200 + 50),
    },
    frameIndex: i,
  }));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const video = await db.checkinVideo.findUnique({
      where: { id },
      include: { contract: { include: { inspections: { include: { damageReport: true } } } } },
    });

    if (!video) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    const damageCount = Math.floor(Math.random() * 3) + 2; // 2-4 damages
    const damages = pickRandom(DAMAGE_TEMPLATES, damageCount);
    const frameCount = 45;

    // Create damage report
    const report = await db.damageReport.create({
      data: {
        checkinVideoId: video.id,
        modelVersion: 'car-damage-detection/3',
        damages: JSON.stringify(damages),
        frameCount,
        processingMs: Math.floor(Math.random() * 5000 + 3000),
      },
    });

    // Update video status
    await db.checkinVideo.update({
      where: { id: video.id },
      data: { status: 'completed', duration: 75, sizeBytes: 52428800 },
    });

    // Check if comparison is possible
    const otherKind = video.kind === 'pickup' ? 'return' : 'pickup';
    const otherVideo = video.contract.inspections.find((v) => v.kind === otherKind);
    let comparison = null;

    if (otherVideo?.damageReport) {
      const pickupReport = video.kind === 'pickup' ? report : otherVideo.damageReport;
      const returnReport = video.kind === 'return' ? report : otherVideo.damageReport;

      const pickupDamages = JSON.parse(pickupReport.damages);
      const returnDamages = JSON.parse(returnReport.damages);

      // Simple comparison: damages in return but not pickup are "new"
      const newDamages = returnDamages.filter(
        (rd: any) => !pickupDamages.some((pd: any) => pd.class === rd.class && pd.location === pd.location)
      );
      const preExisting = returnDamages.filter(
        (rd: any) => pickupDamages.some((pd: any) => pd.class === rd.class)
      );

      comparison = await db.damageComparison.create({
        data: {
          contractId: video.contract.id,
          pickupReportId: pickupReport.id,
          returnReportId: returnReport.id,
          newDamages: JSON.stringify(newDamages),
          preExistingDamages: JSON.stringify(preExisting),
          status: 'awaiting_signature',
        },
      });
    }

    return NextResponse.json({
      status: 'completed',
      damageReport: { ...report, damages: JSON.parse(report.damages) },
      comparison,
    });
  } catch (error) {
    console.error('Error simulating completion:', error);
    return NextResponse.json({ error: 'Failed to process' }, { status: 500 });
  }
}
