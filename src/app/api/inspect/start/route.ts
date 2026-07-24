import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contractId, kind } = body;

    if (!contractId || !kind) {
      return NextResponse.json({ error: 'Missing contractId or kind' }, { status: 400 });
    }

    if (!['pickup', 'return'].includes(kind)) {
      return NextResponse.json({ error: 'Invalid kind. Must be pickup or return' }, { status: 400 });
    }

    const contract = await db.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    const video = await db.checkinVideo.create({
      data: {
        contractId,
        kind,
        status: 'pending_upload',
      },
    });

    return NextResponse.json({
      videoId: video.id,
      tusEndpoint: '/api/tus?XTransformPort=3001',
      tusAuthToken: `demo-token-${video.id}`,
    });
  } catch (error) {
    console.error('Error starting inspection:', error);
    return NextResponse.json({ error: 'Failed to start inspection' }, { status: 500 });
  }
}
