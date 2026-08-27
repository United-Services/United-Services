import { AppointmentsGateway } from './appointments.gateway';

describe('AppointmentsGateway', () => {
  it('emits slots:changed on the socket server', () => {
    const gateway = new AppointmentsGateway();
    gateway.server = { emit: jest.fn() } as any;

    gateway.slotsChanged();

    expect(gateway.server.emit).toHaveBeenCalledWith('slots:changed');
  });

  it('does not throw when called before the server is attached (e.g. during module init ordering)', () => {
    const gateway = new AppointmentsGateway();
    expect(() => gateway.slotsChanged()).not.toThrow();
  });
});
