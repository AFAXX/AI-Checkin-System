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

// POST /api/contracts — Save inspection signature (pickup or return)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractId, kind, signaturePngBase64, signerName, damages } = body;

    if (!contractId || !kind) {
      return NextResponse.json({ error: 'Missing contractId or kind' }, { status: 400 });
    }

    const contract = await db.contract.findUnique({
      where: { id: contractId },
      include: {
        inspections: {
          include: { damageReport: true },
          orderBy: { createdAt: 'desc' },
        },
        comparisons: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    if (kind === 'pickup') {
      // Find or create pickup inspection + damage report
      let pickupVideo = contract.inspections?.find(v => v.kind === 'pickup');

      if (!pickupVideo) {
        // Create the video record
        pickupVideo = await db.checkinVideo.create({
          data: {
            contractId,
            kind: 'pickup',
            status: 'completed',
            duration: 75,
            sizeBytes: 52428800,
          },
        });
      }

      // Create damage report if not exists and damages were provided
      const existingReport = pickupVideo.damageReport;
      if (!existingReport && damages && damages.length > 0) {
        await db.damageReport.create({
          data: {
            checkinVideoId: pickupVideo.id,
            modelVersion: 'car-damage-detection/3',
            damages: typeof damages === 'string' ? damages : JSON.stringify(damages),
            frameCount: 45,
            processingMs: 3200,
          },
        });
      }

      return NextResponse.json({ success: true, kind: 'pickup', videoId: pickupVideo.id });

    } else if (kind === 'return') {
      // Find or create return inspection
      let returnVideo = contract.inspections?.find(v => v.kind === 'return');

      if (!returnVideo) {
        returnVideo = await db.checkinVideo.create({
          data: {
            contractId,
            kind: 'return',
            status: 'completed',
            duration: 75,
            sizeBytes: 52428800,
          },
        });
      }

      // Create damage report for return if not exists
      const existingReturnReport = returnVideo.damageReport;
      if (!existingReturnReport && damages && damages.length > 0) {
        await db.damageReport.create({
          data: {
            checkinVideoId: returnVideo.id,
            modelVersion: 'car-damage-detection/3',
            damages: typeof damages === 'string' ? damages : JSON.stringify(damages),
            frameCount: 45,
            processingMs: 3800,
          },
        });
      }

      // Find or create comparison
      let comparison = contract.comparisons?.[0];

      if (comparison) {
        // Update existing comparison with signature
        comparison = await db.damageComparison.update({
          where: { id: comparison.id },
          data: {
            signatureUrl: signaturePngBase64 || null,
            signedAt: new Date(),
            signedByName: signerName || null,
            status: 'completed',
          },
        });
      } else {
        // Create new comparison with placeholder reports
        const pickupVideo = contract.inspections?.find(v => v.kind === 'pickup');
        const pickupReport = pickupVideo?.damageReport;

        if (pickupReport) {
          // Re-fetch to get the return report we just created
          const returnVideoUpdated = await db.checkinVideo.findUnique({
            where: { id: returnVideo.id },
            include: { damageReport: true },
          });
          const returnReport = returnVideoUpdated?.damageReport;

          if (returnReport) {
            const pickupDamages = JSON.parse(pickupReport.damages);
            const returnDamages = returnReport.damages
              ? JSON.parse(typeof returnReport.damages === 'string' ? returnReport.damages : JSON.stringify(returnReport.damages))
              : [];

            // Simple comparison logic
            const newDamages = returnDamages.filter(
              (rd: any) => !pickupDamages.some((pd: any) => pd.class === rd.class && pd.location === pd.location)
            );
            const preExisting = returnDamages.filter(
              (rd: any) => pickupDamages.some((pd: any) => pd.class === rd.class)
            );

            comparison = await db.damageComparison.create({
              data: {
                contractId,
                pickupReportId: pickupReport.id,
                returnReportId: returnReport.id,
                newDamages: JSON.stringify(newDamages),
                preExistingDamages: JSON.stringify(preExisting),
                signatureUrl: signaturePngBase64 || null,
                signedAt: new Date(),
                signedByName: signerName || null,
                status: 'completed',
              },
            });
          }
        }
      }

      // Mark contract as completed
      await db.contract.update({
        where: { id: contractId },
        data: { status: 'completed' },
      });

      return NextResponse.json({ success: true, kind: 'return', comparison });

    } else {
      return NextResponse.json({ error: 'Invalid kind. Must be pickup or return' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error saving contract:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
