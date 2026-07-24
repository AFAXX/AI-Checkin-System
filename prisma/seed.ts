import { PrismaClient, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clean existing data
  await prisma.damageComparison.deleteMany()
  await prisma.damageReport.deleteMany()
  await prisma.checkinVideo.deleteMany()
  await prisma.contract.deleteMany()
  await prisma.staffUser.deleteMany()

  // Seed Staff Users
  const staffUsers = await Promise.all([
    prisma.staffUser.create({
      data: {
        entraOid: 'demo-staff-oid-001',
        email: 'staff@hertzmalta.com',
        displayName: 'Maria Borg',
        role: UserRole.staff,
        locationCode: 'MLA',
        isActive: true,
      },
    }),
    prisma.staffUser.create({
      data: {
        entraOid: 'demo-manager-oid-002',
        email: 'manager@hertzmalta.com',
        displayName: 'Mark Vella',
        role: UserRole.manager,
        locationCode: 'MLA',
        isActive: true,
      },
    }),
    prisma.staffUser.create({
      data: {
        entraOid: 'demo-admin-oid-003',
        email: 'admin@hertzmalta.com',
        displayName: 'Claire Farrugia',
        role: UserRole.admin,
        locationCode: 'MLA',
        isActive: true,
      },
    }),
  ])

  console.log(`Created ${staffUsers.length} staff users`)

  // Seed Contracts
  const today = new Date()
  const contracts = await Promise.all([
    prisma.contract.create({
      data: {
        reservationNumber: 'RES-2024-001',
        customerName: 'John Smith',
        customerEmail: 'john.smith@email.com',
        vehicleReg: 'MAL-001-A',
        vehicleModel: 'Toyota Corolla',
        pickupDate: new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000),
        returnDate: new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000),
        status: 'active',
        locationCode: 'MLA',
      },
    }),
    prisma.contract.create({
      data: {
        reservationNumber: 'RES-2024-002',
        customerName: 'Sarah Johnson',
        customerEmail: 'sarah.j@email.com',
        vehicleReg: 'MAL-002-B',
        vehicleModel: 'VW Golf',
        pickupDate: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000),
        returnDate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000),
        status: 'active',
        locationCode: 'MLA',
      },
    }),
    prisma.contract.create({
      data: {
        reservationNumber: 'RES-2024-003',
        customerName: 'Luigi Rossi',
        customerEmail: 'luigi.rossi@email.com',
        vehicleReg: 'MAL-003-C',
        vehicleModel: 'Fiat 500',
        pickupDate: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000),
        returnDate: new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000),
        status: 'active',
        locationCode: 'MLA',
      },
    }),
    prisma.contract.create({
      data: {
        reservationNumber: 'RES-2024-004',
        customerName: 'Anna Bauer',
        customerEmail: 'anna.bauer@email.com',
        vehicleReg: 'MAL-004-D',
        vehicleModel: 'BMW 3 Series',
        pickupDate: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000),
        returnDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000),
        status: 'active',
        locationCode: 'MLA',
      },
    }),
    prisma.contract.create({
      data: {
        reservationNumber: 'RES-2024-005',
        customerName: 'Pierre Dupont',
        customerEmail: 'pierre.dupont@email.com',
        vehicleReg: 'MAL-005-E',
        vehicleModel: 'Peugeot 208',
        pickupDate: new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000),
        returnDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000),
        status: 'active',
        locationCode: 'MLA',
      },
    }),
  ])

  console.log(`Created ${contracts.length} contracts`)
  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
