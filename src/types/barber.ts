export type Barber = {
  id: string;
  name: string | null;
  email: string;
  phone?: string | null;
  isActive: boolean;
  role?: "BARBER"; // opcional
};
