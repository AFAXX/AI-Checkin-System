import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const body = await request.json();
    const { overrideNotes, newDamages, preExistingDamages } = body;

    const comparison = await db.damageComparison.findUnique({ where: { id } });

    if (!comparison) {
      return NextResponse.json({ error: 'Comparison not found' }, { status: 404 });
    }

    const updateData: any = { overrideNotes };
    if (newDamages) updateData.newDamages = JSON.stringify(newDamages);
    if (preExistingDamages) updateData.preExistingDamages = JSON.stringify(preExistingDamages);

    const updated = await db.damageComparison.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error overriding:', error);
    return NextResponse.json({ error: 'Failed to override' }, { status: 500 });
  }
}
