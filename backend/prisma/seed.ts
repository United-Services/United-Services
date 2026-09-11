import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  Role,
  FileAccessStatus,
  ServiceRequestStatus,
  ApplicationStatus,
  type Service,
} from '../src/generated/prisma';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SERVICES = [
  {
    slug: 'gre-tubular-lining',
    name: 'GRE Tubular Lining',
    shortDescription: 'USE Liner® · Holiday-Free · Sour Service Corrosion Barrier',
    longDescription:
      "USE Liner® glass-reinforced epoxy (GRE) tubing and casing linings guard against corrosion damage and OD wear in corrosive injection, acid gas, salt-water disposal, and production wells. Holiday-free tested and matching the tensile strength of the host steel, USE Liner® is proven technology backed by decades of service in sour and aggressive environments. Our field crew supervises every installation — seating the compression ring, inspecting the connection, and drift-testing each joint before it is tripped into the well.",
    iconKey: 'gre-lining',
    order: 1,
  },
  {
    slug: 'external-wrapping',
    name: 'External Wrapping',
    shortDescription: 'ISO 21809 · Multi-Layer Tape Systems',
    longDescription:
      'Multi-layer cold-applied and heat-shrink tape systems for external pipeline protection against soil corrosion, mechanical damage, and UV degradation. USE external wrap systems are qualified to ISO 21809-3 and DIN 30672 for onshore buried pipelines and subsea risers across Egypt, Iraq, KSA, and UAE.',
    iconKey: 'external-wrapping',
    order: 2,
  },
  {
    slug: 'industrial-coating',
    name: 'Internal & External Coating',
    shortDescription: 'HB Liquid Phenolic Novolac Epoxy · Corrosion Protection',
    longDescription:
      "USE's internal and external pipe coating systems protect inner casing, tubing, ESP equipment, control lines, elbows, tees, and outer conductors against corrosion in new and brown wells. Applied at our facility using HB Liquid Phenolic Novolac Epoxy, fully holiday-tested to NACE SP0188.",
    iconKey: 'industrial-coating',
    order: 3,
  },
  // hdpe-lining is intentionally NOT part of the public "Additional
  // Services" catalog (see frontend PUBLIC_ADDITIONAL_SERVICE_SLUGS) —
  // client direction narrowed the public catalog to GRE (flagship) +
  // internal/external coating + RTP + RTV. Left seeded (not deleted):
  // the live row has a real client file + service request attached, and
  // Service->ServiceFile is an onDelete: Cascade relation.
  {
    slug: 'hdpe-lining',
    name: 'HDPE Lining',
    shortDescription: 'PE100 / ASTM · Water Injection & Chemical Lines',
    longDescription:
      'High-Density Polyethylene (HDPE) slip-lining and factory-installed liner systems for water injection pipelines and chemical transport lines, PE100 grade conforming to ASTM D3350 and ISO 4427.',
    iconKey: 'hdpe-lining',
    order: 4,
  },
  {
    slug: 'rtp-systems',
    name: 'RTP Systems',
    shortDescription: 'DN40–200 · 0.6–32 MPa · Reinforced Thermoplastic',
    longDescription:
      'Non-bonded flexible composite pipe developed to replace medium-pressure steel in corrosive onshore oil and gas service — an inner lining layer, a high-strength fiber reinforcement layer, and a UV- and abrasion-resistant outer layer, each independently engineered.',
    iconKey: 'rtp-systems',
    order: 5,
  },
  {
    slug: 'rtv-insulator-coating',
    name: 'RTV Insulator Coating',
    shortDescription: 'IEC 62073 · High-Voltage Insulator Protection',
    longDescription:
      'One-part, hydrophobic, UV-resistant Room Temperature Vulcanising (RTV) coating that prevents conductive-layer formation on ceramic and glass insulators in polluted environments — for AC and DC systems up to 1200 kV. Eliminates flashovers and scheduled insulator washing.',
    iconKey: 'rtv-insulator',
    order: 6,
  },
];

async function main() {
  const admin = await prisma.user.upsert({
    where: { clerkId: 'seed_admin_1' },
    update: {},
    create: {
      clerkId: 'seed_admin_1',
      role: Role.admin,
      email: 'admin@use-eg.com',
      firstName: 'Nour',
      lastName: 'Fathy',
      phone: '(+2) 0227033656',
      mfaEnrolled: true,
    },
  });

  const client1 = await prisma.user.upsert({
    where: { clerkId: 'seed_client_1' },
    update: {},
    create: {
      clerkId: 'seed_client_1',
      role: Role.client,
      email: 'ahmed.khalil@petrobel.com.eg',
      firstName: 'Ahmed',
      lastName: 'Khalil',
      phone: '+20 2 1234 5678',
      companyName: 'Petrobel',
    },
  });

  const client2 = await prisma.user.upsert({
    where: { clerkId: 'seed_client_2' },
    update: {},
    create: {
      clerkId: 'seed_client_2',
      role: Role.client,
      email: 'sara.mostafa@bapetco.com',
      firstName: 'Sara',
      lastName: 'Mostafa',
      phone: '+20 2 2345 6789',
      companyName: 'Bapetco',
    },
  });

  const candidateUser = await prisma.user.upsert({
    where: { clerkId: 'seed_candidate_1' },
    update: {},
    create: {
      clerkId: 'seed_candidate_1',
      role: Role.candidate,
      email: 'omar.saeed@example.com',
      firstName: 'Omar',
      lastName: 'Saeed',
    },
  });

  const services: Service[] = [];
  for (const s of SERVICES) {
    const service = await prisma.service.upsert({
      where: { slug: s.slug },
      update: {},
      create: { ...s, updatedByAdminId: admin.id },
    });
    services.push(service);
  }

  const greService = services[0];
  const serviceFile = await prisma.serviceFile.create({
    data: {
      serviceId: greService.id,
      s3Key: `service-specs/${greService.slug}/spec-v1.pdf`,
      originalFilename: 'USE-GRE-Lining-Spec-v1.pdf',
      uploadedByAdminId: admin.id,
    },
  });

  await prisma.fileAccessRequest.create({
    data: {
      clientId: client1.id,
      serviceFileId: serviceFile.id,
      status: FileAccessStatus.approved,
      decidedAt: new Date(),
      decidedByAdminId: admin.id,
    },
  });

  await prisma.fileAccessRequest.create({
    data: { clientId: client2.id, serviceFileId: serviceFile.id, status: FileAccessStatus.pending },
  });

  await prisma.serviceRequest.create({
    data: {
      clientId: client1.id,
      serviceId: greService.id,
      projectDetails: 'Water injection flowline rehabilitation, DN200, ~4km, H2S service.',
      status: ServiceRequestStatus.in_review,
    },
  });

  const position = await prisma.openPosition.create({
    data: {
      title: 'Senior Corrosion Engineer',
      description: 'Lead pipeline integrity assessments and coating specification for Cairo-based projects.',
      department: 'Engineering',
      createdByAdminId: admin.id,
    },
  });

  await prisma.candidateApplication.create({
    data: {
      candidateUserId: candidateUser.id,
      positionId: position.id,
      idPhotoS3Key: 'candidates/seed_candidate_1/id-photo.jpg',
      cvS3Key: 'candidates/seed_candidate_1/cv.pdf',
      dateOfBirth: new Date('1994-03-12'),
      status: ApplicationStatus.pending,
    },
  });

  const slot = await prisma.appointmentSlot.create({
    data: {
      date: new Date(),
      startTime: new Date(new Date().setHours(10, 0, 0, 0)),
      endTime: new Date(new Date().setHours(11, 0, 0, 0)),
      createdByAdminId: admin.id,
    },
  });
  await prisma.appointmentSlot.create({
    data: {
      date: new Date(),
      startTime: new Date(new Date().setHours(14, 0, 0, 0)),
      endTime: new Date(new Date().setHours(15, 0, 0, 0)),
      createdByAdminId: admin.id,
    },
  });

  await prisma.appointment.create({
    data: { slotId: slot.id, clientId: client1.id },
  });
  await prisma.appointmentSlot.update({ where: { id: slot.id }, data: { isBooked: true } });

  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: 'file_access.approved',
      targetType: 'FileAccessRequest',
      targetId: serviceFile.id,
      metadata: { clientId: client1.id },
    },
  });

  await prisma.analyticsEvent.createMany({
    data: [
      { eventType: 'cta_click.our_services' },
      { eventType: 'cta_click.request_consultation' },
      { eventType: 'client_signup', metadata: { companyName: client1.companyName } },
      { eventType: 'client_signup', metadata: { companyName: client2.companyName } },
      { eventType: 'service_page_view', metadata: { slug: greService.slug } },
    ],
  });

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
