// _tests_/cancel-appointment.test.ts
import { Prisma } from "@prisma/client";

// 👇 precisa existir ANTES dos jest.mock (por causa do hoisting)
var prismaMock: any;

jest.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findUnique: (...args: any[]) =>
        prismaMock.appointment.findUnique(...args),
      update: (...args: any[]) => prismaMock.appointment.update(...args),
    },
    order: {
      findFirst: (...args: any[]) => prismaMock.order.findFirst(...args),
      create: (...args: any[]) => prismaMock.order.create(...args),
      update: (...args: any[]) => prismaMock.order.update(...args),
    },
    orderItem: {
      findFirst: (...args: any[]) => prismaMock.orderItem.findFirst(...args),
      create: (...args: any[]) => prismaMock.orderItem.create(...args),
      aggregate: (...args: any[]) => prismaMock.orderItem.aggregate(...args),
    },
    service: {
      findUnique: (...args: any[]) => prismaMock.service.findUnique(...args),
    },
    user: {
      findUnique: (...args: any[]) => prismaMock.user.findUnique(...args),
      findFirst: (...args: any[]) => prismaMock.user.findFirst(...args),
      upsert: (...args: any[]) => prismaMock.user.upsert(...args),
    },
    barberCancellationFee: {
      create: (...args: any[]) =>
        prismaMock.barberCancellationFee.create(...args),
    },
    $transaction: (...args: any[]) => prismaMock.$transaction(...args),
  },
}));

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
jest.mock("jose", () => ({ jwtVerify: jest.fn() }));
jest.mock("@/lib/nextauth", () => ({ nextAuthOptions: {} }));
jest.mock("next-auth", () => ({
  getServerSession: jest.fn(async () => ({
    user: { id: "admin-1", role: "ADMIN" },
  })),
}));

// 👇 IMPORTA DEPOIS dos mocks
import { cancelAppointment } from "@/app/admin/dashboard/actions";

describe("cancelAppointment - taxa de cancelamento", () => {
  beforeEach(() => {
    prismaMock = {
      appointment: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      orderItem: {
        findFirst: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      service: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
      barberCancellationFee: {
        create: jest.fn(),
      },
      // por padrão, executa callback e retorna o resultado (simula transaction)
      $transaction: jest.fn(async (fn: any) => {
        const tx = {
          appointment: prismaMock.appointment,
          order: prismaMock.order,
          orderItem: prismaMock.orderItem,
          service: prismaMock.service,
          user: prismaMock.user,
          barberCancellationFee: prismaMock.barberCancellationFee,
        };
        return fn(tx);
      }),
    };

    jest.clearAllMocks();
  });

  it("calcula e salva cancelFeeValue quando applyFee=true e há preço/% e está dentro do prazo", async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: "appt-1",
      status: "PENDING",
      concludedByRole: null,
      servicePriceAtTheTime: new Prisma.Decimal(100),
      serviceId: "svc-1",
      barberId: "barber-1",
      unitId: "unit-1",
      scheduleAt: new Date(Date.now() + 60 * 60 * 1000), // +1h
      cancellationFee: null,
    });

    prismaMock.order.findFirst.mockResolvedValue(null);

    prismaMock.service.findUnique.mockResolvedValue({
      cancelFeePercentage: new Prisma.Decimal(20),
      cancelLimitHours: 24,
    });

    prismaMock.appointment.update.mockResolvedValue({ id: "appt-1" });
    prismaMock.barberCancellationFee.create.mockResolvedValue({ id: "fee-1" });

    const res = await cancelAppointment("appt-1", {
      applyFee: true,
      cancelledByRole: "ADMIN",
    });

    expect(res).toEqual({ ok: true });

    // update chamado dentro do $transaction
    const updateArgs = prismaMock.appointment.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("CANCELED");
    expect(updateArgs.data.cancelFeeApplied).toBe(true);
    expect(updateArgs.data.cancelFeeValue.toString()).toBe("20");
  });

  it("não calcula taxa se servicePriceAtTheTime for null (mesmo com applyFee=true)", async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: "appt-2",
      status: "PENDING",
      concludedByRole: null,
      servicePriceAtTheTime: null,
      serviceId: "svc-1",
      barberId: "barber-1",
      unitId: "unit-1",
      scheduleAt: new Date(Date.now() + 60 * 60 * 1000),
      cancellationFee: null,
    });

    prismaMock.order.findFirst.mockResolvedValue(null);

    prismaMock.service.findUnique.mockResolvedValue({
      cancelFeePercentage: new Prisma.Decimal(20),
      cancelLimitHours: 24,
    });

    prismaMock.appointment.update.mockResolvedValue({ id: "appt-2" });

    const res = await cancelAppointment("appt-2", {
      applyFee: true,
      cancelledByRole: "ADMIN",
    });

    expect(res).toEqual({ ok: true });

    const updateArgs = prismaMock.appointment.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe("CANCELED");
    expect(updateArgs.data.cancelFeeApplied).toBe(false);
    expect(updateArgs.data.cancelFeeValue).toBeNull();

    expect(prismaMock.barberCancellationFee.create).not.toHaveBeenCalled();
  });

  it("bloqueia cancelamento se já existe Order (atendimento concluído)", async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: "appt-3",
      status: "PENDING",
      concludedByRole: null,
      servicePriceAtTheTime: new Prisma.Decimal(100),
      serviceId: "svc-1",
      barberId: "barber-1",
      unitId: "unit-1",
      scheduleAt: new Date(Date.now() + 60 * 60 * 1000),
      cancellationFee: null,
    });

    prismaMock.order.findFirst.mockResolvedValue({ id: "order-1" });

    const res = await cancelAppointment("appt-3", {
      applyFee: true,
      cancelledByRole: "ADMIN",
    });

    expect(res).toEqual({
      error: "Não é possível cancelar um atendimento já concluído",
    });

    expect(prismaMock.appointment.update).not.toHaveBeenCalled();
    expect(prismaMock.barberCancellationFee.create).not.toHaveBeenCalled();
  });

  it("não cria cobrança (Order) mesmo quando applyFee=true", async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: "appt-4",
      status: "PENDING",
      concludedByRole: null,
      servicePriceAtTheTime: new Prisma.Decimal(100),
      serviceId: "svc-1",
      barberId: "barber-1",
      unitId: "unit-1",
      scheduleAt: new Date(Date.now() + 60 * 60 * 1000),
      cancellationFee: null,
    });

    prismaMock.order.findFirst.mockResolvedValue(null);

    prismaMock.service.findUnique.mockResolvedValue({
      cancelFeePercentage: new Prisma.Decimal(20),
      cancelLimitHours: 24,
    });

    prismaMock.appointment.update.mockResolvedValue({ id: "appt-4" });
    prismaMock.barberCancellationFee.create.mockResolvedValue({ id: "fee-4" });

    const res = await cancelAppointment("appt-4", {
      applyFee: true,
      cancelledByRole: "ADMIN",
    });

    expect(res).toEqual({ ok: true });

    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });

  it("cria BarberCancellationFee quando applyFee=true e fee > 0", async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: "appt-5",
      status: "PENDING",
      concludedByRole: null,
      servicePriceAtTheTime: new Prisma.Decimal(150),
      serviceId: "svc-1",
      barberId: "barber-1",
      unitId: "unit-1",
      scheduleAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // +2h
      cancellationFee: null,
    });

    prismaMock.order.findFirst.mockResolvedValue(null);

    prismaMock.service.findUnique.mockResolvedValue({
      cancelFeePercentage: new Prisma.Decimal(10), // 15
      cancelLimitHours: 24,
    });

    prismaMock.appointment.update.mockResolvedValue({ id: "appt-5" });
    prismaMock.barberCancellationFee.create.mockResolvedValue({ id: "fee-5" });

    const res = await cancelAppointment("appt-5", {
      applyFee: true,
      cancelledByRole: "ADMIN",
    });

    expect(res).toEqual({ ok: true });

    expect(prismaMock.barberCancellationFee.create).toHaveBeenCalledTimes(1);
    const args = prismaMock.barberCancellationFee.create.mock.calls[0][0];
    expect(args.data.appointmentId).toBe("appt-5");
    expect(args.data.barberId).toBe("barber-1");
    expect(args.data.unitId).toBe("unit-1");
    expect(args.data.amount.toString()).toBe("15");
  });

  it("não duplica BarberCancellationFee se já existir cancellationFee no appointment (idempotência)", async () => {
    prismaMock.appointment.findUnique.mockResolvedValue({
      id: "appt-6",
      status: "PENDING",
      concludedByRole: null,
      servicePriceAtTheTime: new Prisma.Decimal(200),
      serviceId: "svc-1",
      barberId: "barber-1",
      unitId: "unit-1",
      scheduleAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      cancellationFee: { id: "fee-existing" }, // ✅ já existe
    });

    prismaMock.order.findFirst.mockResolvedValue(null);

    prismaMock.service.findUnique.mockResolvedValue({
      cancelFeePercentage: new Prisma.Decimal(10),
      cancelLimitHours: 24,
    });

    prismaMock.appointment.update.mockResolvedValue({ id: "appt-6" });

    const res = await cancelAppointment("appt-6", {
      applyFee: true,
      cancelledByRole: "ADMIN",
    });

    expect(res).toEqual({ ok: true });

    expect(prismaMock.barberCancellationFee.create).not.toHaveBeenCalled();
  });
});
