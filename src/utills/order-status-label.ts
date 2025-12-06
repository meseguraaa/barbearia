export function getOrderStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Pendente";
    case "PAID":
      return "Pago";
    default:
      return status;
  }
}
