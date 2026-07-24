import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { signaturePngBase64, signerName } = body;

    if (!signaturePngBase64 || !signerName) {
      return NextResponse.json(
        { error: 'Missing signaturePngBase64 or signerName' },
        { status: 400 }
      );
    }

    // Find the video and its contract
    const video = await db.checkinVideo.findUnique({
      where: { id },
      include: { contract: true },
    });

    if (!video) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    // Find or create comparison
    let comparison = await db.damageComparison.findFirst({
      where: { contractId: video.contract.id },
      orderBy: { createdAt: 'desc' },
    });

    if (comparison) {
      comparison = await db.damageComparison.update({
        where: { id: comparison.id },
        data: {
          signatureUrl: signaturePngBase64,
          signedAt: new Date(),
          signedByName: signerName,
          status: 'completed',
        },
      });
    } else {
      // Create a comparison without reports (edge case)
      const returnVideo = await db.checkinVideo.findFirst({
        where: { contractId: video.contract.id, kind: 'return', status: 'completed' },
      });
      const pickupVideo = await db.checkinVideo.findFirst({
        where: { contractId: video.contract.id, kind: 'pickup', status: 'completed' },
      });

      if (!pickupVideo?.damageReport || !returnVideo?.damageReport) {
        return NextResponse.json({ error: 'Both pickup and return reports required' }, { status: 400 });
      }

      comparison = await db.damageComparison.create({
        data: {
          contractId: video.contract.id,
          pickupReportId: pickupVideo.damageReport.id,
          returnReportId: returnVideo.damageReport.id,
          newDamages: '[]',
          preExistingDamages: '[]',
          signatureUrl: signaturePngBase64,
          signedAt: new Date(),
          signedByName: signerName,
          status: 'completed',
        },
      });
    }

    // Update contract status
    await db.contract.update({
      where: { id: video.contract.id },
      data: { status: 'completed' },
    });

    return NextResponse.json({ success: true, comparison });
  } catch (error) {
    console.error('Error signing inspection:', error);
    return NextResponse.json({ error: 'Failed to sign' }, { status: 500 });
  }
}
