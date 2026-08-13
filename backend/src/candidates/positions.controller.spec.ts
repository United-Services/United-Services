import { PositionsController } from './positions.controller';
import type { PrismaService } from '../prisma/prisma.service';
import type { User } from '../generated/prisma';

describe('PositionsController', () => {
  const admin = { id: 'admin-1' } as User;

  function makeController() {
    const prisma = {
      openPosition: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService;
    return { controller: new PositionsController(prisma), prisma };
  }

  it('the public listOpen endpoint only ever queries isOpen positions', async () => {
    const { controller, prisma } = makeController();
    await controller.listOpen();
    expect(prisma.openPosition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isOpen: true } }),
    );
  });

  it('the admin listAll endpoint has no isOpen filter', async () => {
    const { controller, prisma } = makeController();
    await controller.listAll();
    const call = (prisma.openPosition.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toBeUndefined();
  });

  it('create attaches the posting admin\'s id', async () => {
    const { controller, prisma } = makeController();
    (prisma.openPosition.create as jest.Mock).mockResolvedValue({ id: 'pos-1' });

    await controller.create(admin, { title: 'Engineer', department: 'Engineering', description: 'desc' });

    expect(prisma.openPosition.create).toHaveBeenCalledWith({
      data: { title: 'Engineer', department: 'Engineering', description: 'desc', createdByAdminId: admin.id },
    });
  });

  it('update can close a position via isOpen: false', async () => {
    const { controller, prisma } = makeController();
    (prisma.openPosition.update as jest.Mock).mockResolvedValue({ id: 'pos-1', isOpen: false });

    await controller.update('pos-1', { isOpen: false });

    expect(prisma.openPosition.update).toHaveBeenCalledWith({ where: { id: 'pos-1' }, data: { isOpen: false } });
  });
});
